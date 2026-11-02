import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterLists, remediationTasks } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import {
  attestCrossings,
  correctRecipient,
  decideTenant,
  excludeCandidate,
  generateList,
  selectParcel,
} from '@/features/abutters/lists'
import { currentIssuedList } from '@/features/abutters/queries'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { upsertPark } from '@/features/rosters/parks'
import { addProfessional } from '@/features/rosters/professionals'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
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

async function generate(now = LIST_NOW) {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    now,
  )
  if (!made.ok) throw new Error(`generate failed: ${JSON.stringify(made.error)}`)
  return made.value
}

async function issue(listId: string) {
  return await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
}

describe('issuing', () => {
  it('issue freezes the snapshot and its sha256', async () => {
    const { listId } = await generate()
    const issued = await issue(listId)
    expect(issued.ok).toBe(true)
    const current = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(current?.snapshotSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(current?.snapshot.recipients).toHaveLength(9)
    expect(issued.ok && issued.value.sha256).toBe(current?.snapshotSha256)
  })

  it('issue with an undecided park tenant is refused with park_tenants_undecided', async () => {
    await upsertPark(
      handle.db,
      world.staff,
      {
        parcelId: lw.ids.SW ?? '',
        parkName: 'Heron Park',
        ownerName: 'Heron Park LLC',
        ownerMailingAddress: '1 Heron Road, Alder Pond NH',
        tenants: [
          {
            tenantId: 's4',
            name: 'Lee Marsh',
            mailingAddress: '4 Heron Road',
            siteLabel: 'Site 4',
          },
        ],
        asOf: d('2027-02-01'),
      },
      signal,
    )
    const { listId } = await generate()
    const refused = await issue(listId)
    expect(refused.ok).toBe(false)
    if (!refused.ok && typeof refused.error === 'object') {
      expect(refused.error.incomplete.map((i) => i.code)).toEqual(['park_tenants_undecided'])
    }
    const tenant = (await handle.db.query.abutterListRecipients.findMany()).find(
      (r) => (r.data as { name: string }).name === 'Lee Marsh',
    )
    await decideTenant(
      handle.db,
      world.staff,
      {
        listId,
        recipientId: tenant?.id ?? '',
        qualifies: true,
        reason: 'Owns the manufactured home on site 4',
      },
      signal,
      LIST_NOW,
    )
    expect((await issue(listId)).ok).toBe(true)
  })

  it('a tenant who does not qualify is left off the issued list', async () => {
    await upsertPark(
      handle.db,
      world.staff,
      {
        parcelId: lw.ids.SW ?? '',
        parkName: 'Heron Park',
        ownerName: 'Heron Park LLC',
        ownerMailingAddress: '1 Heron Road, Alder Pond NH',
        tenants: [
          {
            tenantId: 's4',
            name: 'Lee Marsh',
            mailingAddress: '4 Heron Road',
            siteLabel: 'Site 4',
          },
        ],
        asOf: d('2027-02-01'),
      },
      signal,
    )
    const { listId } = await generate()
    const tenant = (await handle.db.query.abutterListRecipients.findMany()).find(
      (r) => (r.data as { name: string }).name === 'Lee Marsh',
    )
    await decideTenant(
      handle.db,
      world.staff,
      {
        listId,
        recipientId: tenant?.id ?? '',
        qualifies: false,
        reason: 'Rents the home and does not own it',
      },
      signal,
      LIST_NOW,
    )
    await issue(listId)
    const names = (
      await currentIssuedList(handle.db, lw.applicationId, signal)
    )?.snapshot.recipients.map((r) => r.name)
    expect(names).not.toContain('Lee Marsh')
    expect(names).toContain('Heron Park LLC')
  })

  it('missing roads layer keeps the list unissuable until crossings are attested', async () => {
    await handle.db.execute(
      (await import('drizzle-orm')).sql`delete from gis_features where layer_key = 'roads'`,
    )
    await handle.db.execute(
      (await import('drizzle-orm'))
        .sql`update gis_layers set last_success_at = null, adapter = null where key = 'roads'`,
    )
    const { listId } = await generate()
    const refused = await issue(listId)
    expect(refused.ok).toBe(false)
    if (!refused.ok && typeof refused.error === 'object') {
      expect(refused.error.incomplete.map((i) => i.code)).toEqual(['crossing_layers_unavailable'])
    }
    expect(await attestCrossings(handle.db, world.staff, { listId }, signal, LIST_NOW)).toEqual({
      ok: true,
      value: undefined,
    })
    expect((await issue(listId)).ok).toBe(true)
  })

  it('issuing a list that is not a draft is not_draft', async () => {
    const { listId } = await generate()
    await issue(listId)
    expect(await issue(listId)).toEqual({ ok: false, error: 'not_draft' })
  })

  it('reviewer issuing a list is forbidden', async () => {
    const { listId } = await generate()
    expect(await issueList(handle.db, world.reviewer, { listId }, signal, LIST_NOW)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('regional impact recorded after issue opens a remediation task', async () => {
    const { listId } = await generate()
    await issue(listId)
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId, determination: 'yes', municipalityKeys: ['dunmore'] },
      signal,
      LIST_NOW,
    )
    const tasks = await handle.db.select().from(remediationTasks)
    expect(tasks.map((t) => t.description)).toEqual([
      'Regenerate the abutter list: determination changed',
    ])
  })
})
