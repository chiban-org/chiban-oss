import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, parcelAliases } from '@/db/schema'
import {
  addAssociation,
  updateAssociation,
  upsertAssociation,
} from '@/features/rosters/associations'
import { loadContactRows } from '@/features/rosters/contactRows'
import { condoGaps } from '@/features/rosters/gaps'
import { loadParcelContacts } from '@/features/rosters/parcelContacts'
import { endRosterEntry } from '@/features/rosters/rosterEnd'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let lw: ListWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  lw = await prepareListWorld(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

const OFFICER = { name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105' }

async function saveAssociation(): Promise<string> {
  const saved = await upsertAssociation(
    handle.db,
    world.staff,
    {
      parcelId: lw.ids.SW ?? '',
      associationName: 'Pond View Condominium',
      officers: [OFFICER],
      asOf: '2027-02-01' as CivilDate,
    },
    signal,
  )
  if (!saved.ok) throw new Error(saved.error)
  const row = await handle.db.query.associationRosters.findFirst()
  return row?.id ?? ''
}

async function end(kind: 'association' | 'park', entryId: string) {
  return await endRosterEntry(
    handle.db,
    world.staff,
    { kind, entryId, endedOn: '2027-03-20' as CivilDate },
    signal,
  )
}

describe('how an ended association shows', () => {
  it('lists a multi-unit parcel as missing its association once the association has ended', async () => {
    const parcelId = lw.ids.SW ?? ''
    await handle.db.insert(parcelAliases).values(
      ['009001000001', '009001000002'].map((value) => ({
        parcelId,
        format: 'cama15',
        value,
        valueNormalized: value,
        status: 'active' as const,
        source: 'manual' as const,
      })),
    )
    const entryId = await saveAssociation()
    const today = '2027-03-24' as CivilDate
    expect(await condoGaps(handle.db, signal, null, today)).toEqual([])
    await end('association', entryId)
    expect((await condoGaps(handle.db, signal, null, today)).map((g) => g.parcelId)).toEqual([
      parcelId,
    ])
    expect(await condoGaps(handle.db, signal, null, '2027-03-19' as CivilDate)).toEqual([])
    const contacts = await loadParcelContacts(
      handle.db,
      world.staff,
      { parcelId, now: LIST_NOW },
      signal,
    )
    expect(contacts?.associations).toEqual([])
    expect(contacts?.missingAssociation).not.toBeNull()
  })

  it('keeps the earlier versions of an ended association and its replacement apart', async () => {
    const parcelId = lw.ids.SW ?? ''
    const ended = await saveAssociation()
    await end('association', ended)
    const replacement = {
      parcelId,
      associationName: 'Pond View Owners Association',
      officers: [{ ...OFFICER, name: 'Lee Marsh' }],
      asOf: '2027-03-21' as CivilDate,
    }
    await addAssociation(handle.db, world.staff, replacement, signal)
    await updateAssociation(
      handle.db,
      world.staff,
      { ...replacement, officers: [{ ...OFFICER, name: 'Cass Pryor' }] },
      signal,
    )
    const rows = await loadContactRows(
      handle.db,
      {
        today: '2027-03-24' as CivilDate,
        recheckDays: 365,
        timeZone: 'America/New_York',
        parcelId,
      },
      signal,
    )
    const byName = new Map(rows.associations.map((a) => [a.name, a.versions]))
    expect(byName.get('Pond View Condominium')).toEqual([])
    const replaced = byName.get('Pond View Owners Association') ?? []
    expect(replaced).toHaveLength(1)
    expect(replaced[0]?.lines.join(' ')).toContain('Lee Marsh')
  })

  it('gives history recorded before entries carried their id to the first association only', async () => {
    const parcelId = lw.ids.SW ?? ''
    const ended = await saveAssociation()
    await handle.db.insert(auditLog).values({
      actorKind: 'user',
      actorUserId: world.staff.userId,
      action: 'roster.association.update',
      entityType: 'parcel',
      entityId: parcelId,
      before: { associationName: 'Pond View Trust', officers: [OFFICER], asOf: '2026-01-10' },
      after: { associationName: 'Pond View Condominium', officers: [OFFICER], asOf: '2027-02-01' },
    })
    await end('association', ended)
    await addAssociation(
      handle.db,
      world.staff,
      {
        parcelId,
        associationName: 'Pond View Owners Association',
        officers: [{ ...OFFICER, name: 'Lee Marsh' }],
        asOf: '2027-03-21' as CivilDate,
      },
      signal,
    )
    const rows = await loadContactRows(
      handle.db,
      {
        today: '2027-03-24' as CivilDate,
        recheckDays: 365,
        timeZone: 'America/New_York',
        parcelId,
      },
      signal,
    )
    const byName = new Map(rows.associations.map((a) => [a.name, a.versions]))
    expect(byName.get('Pond View Condominium')?.map((v) => v.lines[0])).toEqual(['Pond View Trust'])
    expect(byName.get('Pond View Owners Association')).toEqual([])
  })
})
