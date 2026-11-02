import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterListCandidates, abutterLists, remediationTasks } from '@/db/schema'
import { setApplicantParcels } from '@/features/abutters/applicantParcels'
import { issueList } from '@/features/abutters/issue'
import { generateList, selectParcel } from '@/features/abutters/lists'
import { hasOpenRegeneration } from '@/features/abutters/staleList'
import { deriveNoticeItems } from '@/features/notices/deriveItems'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
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
  await publishRegionalContacts(handle.db, world)
  lw = await prepareListWorld(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

async function draft(): Promise<string> {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error(`generate failed: ${JSON.stringify(made.error)}`)
  return made.value.listId
}

async function setParcels(...names: string[]) {
  return await setApplicantParcels(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId, parcelIds: names.map((n) => lw.ids[n] ?? '') },
    signal,
  )
}

async function statusOf(listId: string) {
  const [row] = await handle.db.select().from(abutterLists).where(eq(abutterLists.id, listId))
  return row?.status
}

describe('changing the applicant parcels', () => {
  it('adding a parcel after a draft discards the draft so it cannot be issued', async () => {
    const listId = await draft()
    expect(await setParcels('A', 'M6')).toEqual({ ok: true, value: undefined })
    expect(await statusOf(listId)).toBe('discarded')
    expect(await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)).toEqual({
      ok: false,
      error: 'not_draft',
    })
  })

  it('staff selections on a draft discarded by a parcel change carry into the next draft', async () => {
    const listId = await draft()
    const picked = lw.ids.M4 ?? ''
    await selectParcel(
      handle.db,
      world.staff,
      { listId, parcelId: picked, crossing: 'street', note: 'Across Mill Road' },
      signal,
      LIST_NOW,
    )
    await setParcels('A', 'M6')
    const next = await draft()
    const rows = await handle.db
      .select()
      .from(abutterListCandidates)
      .where(eq(abutterListCandidates.listId, next))
    expect(rows.find((c) => c.parcelId === picked)?.reasons ?? []).toContainEqual(
      expect.objectContaining({ kind: 'staff_selected', note: 'Across Mill Road' }),
    )
  })

  it('setting the same parcels again keeps the draft', async () => {
    const listId = await draft()
    await setParcels('A')
    expect(await statusOf(listId)).toBe('draft')
  })

  it('an issued list cannot support notice after the applicant parcels change', async () => {
    const listId = await draft()
    expect((await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)).ok).toBe(true)
    await setParcels('A', 'M6')
    const derived = await handle.db.transaction((tx) =>
      deriveNoticeItems(
        tx,
        {
          subjectKind: 'hearing',
          subjectId: crypto.randomUUID(),
          applicationId: lw.applicationId,
          anchorDate: '2027-04-14' as CivilDate,
        },
        signal,
      ),
    )
    expect(derived).toEqual({ ok: false, error: 'list_out_of_date' })
    const tasks = await handle.db
      .select()
      .from(remediationTasks)
      .where(eq(remediationTasks.applicationId, lw.applicationId))
    expect(tasks.map((t) => t.description)).toContain(
      'Regenerate the abutter list: the applicant parcels changed',
    )
  })
  it('issuing a new list clears the reminder to regenerate', async () => {
    const listId = await draft()
    await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
    await setParcels('A', 'M6')
    const next = await draft()
    expect((await issueList(handle.db, world.staff, { listId: next }, signal, LIST_NOW)).ok).toBe(
      true,
    )
    expect(await hasOpenRegeneration(handle.db, lw.applicationId)).toBe(false)
  })
})
