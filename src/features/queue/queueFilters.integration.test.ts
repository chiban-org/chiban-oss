import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clocks,
  documents,
  documentVersions,
  files,
  paymentAttempts,
  preservationRecords,
  reviewAssignments,
} from '@/db/schema'
import type { SortState } from '@/features/dataTable/sort'
import { FILING_CLOCK_KEY } from '@/features/decisions/fileDecision'
import { queueFacets } from '@/features/queue/queueFacets'
import type { QueueSortKey } from '@/features/queue/queueParams'
import { listWorkQueue, type WorkQueueFilters } from '@/features/queue/workQueue'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { makeCardAttempt, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
})
afterEach(async () => {
  await handle.drop()
})

async function addClock(
  applicationId: string,
  due: string,
  status: 'running' | 'met' | 'overdue' = 'running',
  ruleKey = 'nh.bp.decision',
) {
  await handle.db.insert(clocks).values({
    applicationId,
    ruleKey,
    ruleVersion: 1,
    packVersion: '0.3.0',
    startEvent: 'application_completed',
    startDate: '2027-02-01',
    lengthValue: 30,
    lengthUnit: 'days',
    countingMethod: 'test',
    computedDue: due,
    currentDue: due,
    source: 'pack_rule',
    status,
  })
}

async function app(patch: Parameters<typeof makeApplication>[2] = {}, type = 'BP') {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'submitted', ...patch },
    undefined,
    type,
  )
  return made.applicationId
}

async function assign(applicationId: string) {
  await assignReviewer(
    handle.db,
    world.staff,
    { applicationId, reviewerUserId: world.reviewer.userId },
    signal,
  )
}

async function markPreservationIncomplete(applicationId: string) {
  const sha256 = applicationId.replaceAll('-', '').padEnd(64, '0')
  await handle.db
    .insert(files)
    .values({ sha256, sizeBytes: 1, contentType: 'application/pdf', storageKey: sha256 })
  const [doc] = await handle.db
    .insert(documents)
    .values({
      recordKind: 'application',
      recordId: applicationId,
      title: 'Plan',
      docKind: 'attachment',
      createdByKind: 'system',
    })
    .returning({ id: documents.id })
  const [version] = await handle.db
    .insert(documentVersions)
    .values({
      documentId: doc?.id ?? '',
      role: 'original',
      fileSha256: sha256,
      filename: 'plan.pdf',
      contentType: 'application/pdf',
    })
    .returning({ id: documentVersions.id })
  await handle.db
    .insert(preservationRecords)
    .values({ originalVersionId: version?.id ?? '', required: true, status: 'incomplete' })
}

const ids = async (
  filters: WorkQueueFilters,
  actor = world.staff,
  sort?: SortState<QueueSortKey>,
) =>
  (
    await listWorkQueue(
      handle.db,
      actor,
      { filters, limit: 50, ...(sort === undefined ? {} : { sort }) },
      signal,
      NOW,
    )
  ).rows.map((r) => r.applicationId)

describe('work queue quick filters', () => {
  it('splits deadlines into overdue, due within 7 days, and no deadline running', async () => {
    const overdue = await app()
    const today = await app()
    const lastDayOfWeek = await app()
    const nextWeek = await app()
    const metOnly = await app()
    const none = await app()
    await addClock(overdue, '2027-03-01')
    await addClock(today, '2027-03-02')
    await addClock(lastDayOfWeek, '2027-03-09')
    await addClock(nextWeek, '2027-03-10')
    await addClock(metOnly, '2027-03-05', 'met')
    expect(await ids({ due: ['overdue'] })).toEqual([overdue])
    expect(await ids({ due: ['week'] })).toEqual([today, lastDayOfWeek])
    expect(new Set(await ids({ due: ['none'] }))).toEqual(new Set([metOnly, none]))
    expect(await ids({ due: ['overdue', 'week'] })).toEqual([overdue, today, lastDayOfWeek])
  })

  it('counts an overdue filing deadline as overdue in the filter, the count and the due sort', async () => {
    const filingLate = await app({ state: 'denied' }, 'EL')
    const soon = await app()
    const none = await app()
    await addClock(filingLate, '2027-02-20', 'overdue', FILING_CLOCK_KEY)
    await addClock(soon, '2027-03-05')
    expect(await ids({ due: ['overdue'] })).toEqual([filingLate])
    expect(await ids({ due: ['none'] })).toEqual([none])
    const facets = await queueFacets(handle.db, world.staff, { filters: {}, now: NOW }, signal)
    expect(facets.due.get('overdue')).toBe(1)
    expect(await ids({ states: ['denied', 'submitted'] })).toEqual([filingLate, soon, none])
    expect(
      await ids({ states: ['denied', 'submitted'] }, world.staff, { key: 'due', dir: 'asc' }),
    ).toEqual([filingLate, soon, none])
  })

  it('finds what is assigned to me and what has no reviewer', async () => {
    const mine = await app()
    const removedOnly = await app()
    const open = await app()
    await assign(mine)
    await assign(removedOnly)
    await handle.db
      .update(reviewAssignments)
      .set({ removedAt: NOW })
      .where(
        and(eq(reviewAssignments.applicationId, removedOnly), isNull(reviewAssignments.removedAt)),
      )
    expect(await ids({ assigned: ['me'] }, world.reviewer)).toEqual([mine])
    expect(await ids({ assigned: ['me'] })).toEqual([])
    expect(new Set(await ids({ assigned: ['none'] }))).toEqual(new Set([removedOnly, open]))
  })

  it('filters by one or more application types', async () => {
    const building = await app()
    const electrical = await app({}, 'EL')
    expect(await ids({ typeKeys: ['EL'] })).toEqual([electrical])
    expect(new Set(await ids({ typeKeys: ['BP', 'EL'] }))).toEqual(new Set([building, electrical]))
  })

  it('flags fees due, an unknown payment outcome, and incomplete preservation', async () => {
    await setupPayments(handle.db, world.admin)
    const trade = await submittedTrade(handle.db, world)
    const unknown = await submittedTrade(handle.db, world)
    const preserved = await app()
    const { attemptId } = await makeCardAttempt(handle.db, unknown)
    await handle.db
      .update(paymentAttempts)
      .set({ outcomeUnknown: true })
      .where(eq(paymentAttempts.id, attemptId))
    await markPreservationIncomplete(preserved)
    expect(new Set(await ids({ flags: ['fees'] }))).toEqual(
      new Set([trade.applicationId, unknown.applicationId]),
    )
    expect(await ids({ flags: ['payment'] })).toEqual([unknown.applicationId])
    expect(await ids({ flags: ['preservation'] })).toEqual([preserved])
    expect(await ids({ flags: ['preservation'] }, world.reviewer)).toEqual([])
    expect(new Set(await ids({ flags: ['payment', 'preservation'] }))).toEqual(
      new Set([unknown.applicationId, preserved]),
    )
  })

  it('combines groups with and, and keeps the state scope and search', async () => {
    const overdueMine = await app()
    const overdueOther = await app()
    const denied = await app({ state: 'denied' })
    await addClock(overdueMine, '2027-03-01')
    await addClock(overdueOther, '2027-03-01')
    await addClock(denied, '2027-03-01')
    await assign(overdueMine)
    expect(await ids({ due: ['overdue'], assigned: ['me'] }, world.reviewer)).toEqual([overdueMine])
    expect(new Set(await ids({ due: ['overdue'], assigned: ['none'] }))).toEqual(
      new Set([overdueOther, denied]),
    )
    expect(await ids({ due: ['overdue'], states: ['denied'] })).toEqual([denied])
  })

  it('counts each chip with the other groups applied, and each type in scope', async () => {
    const overdueBp = await app()
    const overdueEl = await app({}, 'EL')
    await app()
    await app({ state: 'denied' }, 'EL')
    await addClock(overdueBp, '2027-03-01')
    await addClock(overdueEl, '2027-03-01')
    await assign(overdueBp)
    const all = await queueFacets(handle.db, world.staff, { filters: {}, now: NOW }, signal)
    expect(all.due.get('overdue')).toBe(2)
    expect(all.due.get('none')).toBe(1)
    expect(all.assigned.get('none')).toBe(2)
    expect(all.types).toEqual([
      { value: 'BP', label: 'Building permit', count: 2 },
      { value: 'EL', label: 'Electrical permit', count: 1 },
    ])
    const scoped = await queueFacets(
      handle.db,
      world.staff,
      { filters: { typeKeys: ['EL'] }, now: NOW },
      signal,
    )
    expect(scoped.due.get('overdue')).toBe(1)
    expect(scoped.types.map((t) => [t.value, t.count])).toEqual([
      ['BP', 2],
      ['EL', 1],
    ])
  })
})

describe('work queue sorting and paging', () => {
  it('sorts by number both ways and by workflow status', async () => {
    const a = await app()
    const b = await app({ state: 'under_review' })
    const c = await app({ state: 'issued' })
    await addClock(c, '2027-04-01')
    expect(await ids({}, world.staff, { key: 'number', dir: 'asc' })).toEqual([a, b, c])
    expect(await ids({}, world.staff, { key: 'number', dir: 'desc' })).toEqual([c, b, a])
    expect(await ids({}, world.staff, { key: 'status', dir: 'desc' })).toEqual([c, b, a])
  })

  it('keeps empty due dates last in both directions', async () => {
    const soon = await app()
    const none = await app()
    const late = await app()
    await addClock(soon, '2027-03-10')
    await addClock(late, '2027-05-10')
    expect(await ids({})).toEqual([soon, late, none])
    expect(await ids({}, world.staff, { key: 'due', dir: 'desc' })).toEqual([late, soon, none])
  })

  it('sorts by fees and by reviewer, breaking ties by due date, received date, then id', async () => {
    const first = await app({ receivedDate: '2027-01-01' })
    const second = await app({ receivedDate: '2027-02-01' })
    const due = await app({ receivedDate: '2027-03-01' })
    await addClock(due, '2027-03-20')
    const tied = await ids({}, world.staff, { key: 'fees', dir: 'desc' })
    expect(tied).toEqual([due, first, second])
    await assign(second)
    expect(await ids({}, world.staff, { key: 'reviewers', dir: 'asc' })).toEqual([
      second,
      due,
      first,
    ])
  })

  it('pages through a non-default sort without repeating or skipping a row', async () => {
    const made: string[] = []
    for (let i = 0; i < 7; i += 1) made.push(await app())
    const sort: SortState<QueueSortKey> = { key: 'number', dir: 'desc' }
    const seen: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 4; page += 1) {
      const result = await listWorkQueue(
        handle.db,
        world.staff,
        { filters: {}, sort, limit: 3, ...(cursor === undefined ? {} : { cursor }) },
        signal,
        NOW,
      )
      seen.push(...result.rows.map((r) => r.applicationId))
      if (result.nextCursor === null) break
      cursor = result.nextCursor
    }
    expect(seen).toEqual([...made].reverse())
  })
})
