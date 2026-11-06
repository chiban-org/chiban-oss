import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  abutterListRecipients,
  associationRosters,
  auditLog,
  parcelAliases,
  parkRosters,
} from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { loadListView } from '@/features/abutters/listView'
import { currentIssuedList, getList } from '@/features/abutters/queries'
import type { Recipient } from '@/features/abutters/resolution'
import { addAssociation, upsertAssociation } from '@/features/rosters/associations'
import { condoGaps } from '@/features/rosters/gaps'
import { loadParcelContacts } from '@/features/rosters/parcelContacts'
import { upsertPark } from '@/features/rosters/parks'
import { endRosterEntry, undoRosterEnd } from '@/features/rosters/rosterEnd'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const ENDED_ON = '2027-03-20' as CivilDate
const ENDED_AT = new Date('2027-03-20T16:00:00Z')
let handle: TestDb
let world: BoardWorld
let lw: ListWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  await publishRegionalContacts(handle.db, world)
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
      now: new Date('2027-02-01T16:00:00Z'),
    },
    signal,
  )
  if (!saved.ok) throw new Error(saved.error)
  const row = await handle.db.query.associationRosters.findFirst()
  return row?.id ?? ''
}

async function issueNewList(): Promise<string[]> {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  const listId = made.value.listId
  const issued = await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
  if (!issued.ok) throw new Error(JSON.stringify(issued.error))
  const list = await currentIssuedList(handle.db, lw.applicationId, signal)
  return list?.snapshot.recipients.map((r) => r.name) ?? []
}

async function draftNames(): Promise<string[]> {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  const rows = await handle.db
    .select({ data: abutterListRecipients.data })
    .from(abutterListRecipients)
    .where(eq(abutterListRecipients.listId, made.value.listId))
  return rows.map((r) => (r.data as Recipient).name)
}

async function end(kind: 'association' | 'park', entryId: string) {
  return await endRosterEntry(
    handle.db,
    world.staff,
    { kind, entryId, endedOn: ENDED_ON, now: ENDED_AT },
    signal,
  )
}

describe('ending a condo association or park', () => {
  it('leaves an ended association off a newly issued list and keeps the issued one as it was', async () => {
    const entryId = await saveAssociation()
    expect(await issueNewList()).toContain('Dana Whitcomb')
    const before = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(await end('association', entryId)).toEqual({ ok: true, value: undefined })
    const kept = await getList(handle.db, before?.id ?? '', signal)
    expect(kept?.snapshot).toEqual(before?.snapshot)
    const keptRecipients = (kept?.snapshot as { recipients: Recipient[] }).recipients
    expect(keptRecipients.map((r) => r.name)).toContain('Dana Whitcomb')
    expect(await issueNewList()).not.toContain('Dana Whitcomb')
    const [audit] = await handle.db
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(eq(auditLog.action, 'roster.association.end'))
    expect(audit?.after).toEqual({ entryId, endedOn: ENDED_ON })
  })

  it('leaves an ended park owner off a newly issued list', async () => {
    await upsertPark(
      handle.db,
      world.staff,
      {
        parcelId: lw.ids.SW ?? '',
        parkName: 'Heron Park',
        ownerName: 'Heron Park LLC',
        ownerMailingAddress: '1 Heron Road, Alder Pond NH',
        tenants: [
          { tenantId: 's4', name: 'Lee Marsh', siteLabel: 'Site 4', mailingAddress: '4 Heron' },
        ],
        asOf: '2027-02-01' as CivilDate,
        now: new Date('2027-02-01T16:00:00Z'),
      },
      signal,
    )
    const park = await handle.db.query.parkRosters.findFirst()
    expect(await end('park', park?.id ?? '')).toEqual({ ok: true, value: undefined })
    const [row] = await handle.db
      .select({ endedOn: parkRosters.endedOn })
      .from(parkRosters)
      .where(eq(parkRosters.id, park?.id ?? ''))
    expect(row?.endedOn).toBe(ENDED_ON)
    const names = await draftNames()
    expect(names).not.toContain('Heron Park LLC')
    expect(names).not.toContain('Lee Marsh')
    const draft = await handle.db.query.abutterLists.findFirst({
      where: (l, { eq: is }) => is(l.applicationId, lw.applicationId),
    })
    const view = await loadListView(handle.db, world.staff, draft?.id ?? '', signal)
    const sw = view?.candidates.find((c) => c.parcelId === lw.ids.SW)
    expect(sw?.noticeTo).toBeNull()
  })

  it('refuses someone without abutters.manage', async () => {
    const entryId = await saveAssociation()
    const finance = await staffActor(handle.db, 'finance')
    const result = await endRosterEntry(
      handle.db,
      finance,
      { kind: 'association', entryId, endedOn: ENDED_ON },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(
      await undoRosterEnd(handle.db, finance, { kind: 'association', entryId }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('undoes an ending no list has used yet, and not once one has', async () => {
    const entryId = await saveAssociation()
    await end('association', entryId)
    expect(
      await undoRosterEnd(handle.db, world.staff, { kind: 'association', entryId }, signal),
    ).toEqual({ ok: true, value: undefined })
    await end('association', entryId)
    await issueNewList()
    expect(
      await undoRosterEnd(handle.db, world.staff, { kind: 'association', entryId }, signal),
    ).toEqual({ ok: false, error: 'ending_used' })
  })

  it('takes a new association on the parcel once the old one has ended', async () => {
    const entryId = await saveAssociation()
    await end('association', entryId)
    const added = await addAssociation(
      handle.db,
      world.staff,
      {
        parcelId: lw.ids.SW ?? '',
        associationName: 'Pond View Owners Association',
        officers: [{ ...OFFICER, name: 'Lee Marsh' }],
        asOf: '2027-03-21' as CivilDate,
      },
      signal,
    )
    expect(added.ok).toBe(true)
    const rows = await handle.db
      .select({ name: associationRosters.associationName })
      .from(associationRosters)
      .where(and(eq(associationRosters.parcelId, lw.ids.SW ?? '')))
    expect(rows.map((r) => r.name).sort()).toEqual([
      'Pond View Condominium',
      'Pond View Owners Association',
    ])
    expect(
      await undoRosterEnd(handle.db, world.staff, { kind: 'association', entryId }, signal),
    ).toEqual({ ok: false, error: 'replaced' })
    const names = await issueNewList()
    expect(names).toContain('Lee Marsh')
    expect(names).not.toContain('Dana Whitcomb')
  })

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
})
