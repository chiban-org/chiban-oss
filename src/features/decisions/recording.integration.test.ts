import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  applications,
  boardDecisions,
  clocks,
  decisionRecordings,
  documents,
  relianceLinks,
} from '@/db/schema'
import {
  recordDecisionRecording,
  recordFinalWrittenApproval,
  varianceValidity,
} from '@/features/decisions/recording'
import { setActivePackForTest } from '@/features/packs/registry'
import type { PackRule } from '@/features/packs/schema'
import { clocksDailyJob, markUnrecordedVoid } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decideUnderXx, HEARING_DATE } from '@/test/deliveryFixtures'
import { XX_RECORDING, XX_VOID_KEY, xxPackWith } from '@/test/packs/xx/variants'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const APPROVED = d('2027-04-20')
const DUE = addDays(APPROVED, 90)
const NOW = new Date('2027-09-30T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(XX_RECORDING)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: XX_RECORDING,
    classificationKey: 'xx.board_variance',
  })
})
afterEach(async () => {
  await handle.drop()
})

async function approved(approvedOn: CivilDate = APPROVED) {
  const made = await decideUnderXx(handle.db, world)
  const result = await recordFinalWrittenApproval(
    handle.db,
    world.staff,
    { decisionId: made.decisionId, approvedOn },
    signal,
    NOW,
  )
  if (!result.ok) throw new Error(`approval: ${result.error}`)
  return made
}

async function certificateOf(applicationId: string) {
  const [row] = await handle.db
    .insert(documents)
    .values({
      recordKind: 'application',
      recordId: applicationId,
      title: 'Certificate of approval',
      docKind: 'attachment',
      createdByKind: 'system',
    })
    .returning({ id: documents.id })
  return row?.id ?? ''
}

async function record(
  made: { applicationId: string; decisionId: string },
  recordedOn: CivilDate,
  certificateDocumentId?: string,
) {
  return await recordDecisionRecording(
    handle.db,
    world.staff,
    {
      decisionId: made.decisionId,
      registry: 'Vellmora County Registry of Deeds',
      book: '4410',
      page: '212',
      recordedOn,
      certificateDocumentId: certificateDocumentId ?? (await certificateOf(made.applicationId)),
    },
    signal,
    NOW,
  )
}

async function voidClock(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === XX_VOID_KEY)
}

async function stateOf(applicationId: string) {
  const [row] = await handle.db
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.state
}

const lapse = (today: CivilDate) =>
  handle.db.transaction((tx) => markUnrecordedVoid(tx, today, signal))

describe('final written approval', () => {
  it('stores the date and starts the void clock ninety days after it', async () => {
    const made = await approved()
    const [decision] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, made.decisionId))
    expect(decision?.finalWrittenApprovalOn).toBe(APPROVED)
    const clock = await voidClock(made.applicationId)
    expect(clock?.status).toBe('running')
    expect(clock?.startDate).toBe(APPROVED)
    expect(clock?.currentDue).toBe(DUE)
  })

  it('is recorded once, not in the future and not before the vote', async () => {
    const made = await decideUnderXx(handle.db, world)
    const input = (approvedOn: CivilDate) => ({ decisionId: made.decisionId, approvedOn })
    const attempt = (approvedOn: CivilDate) =>
      recordFinalWrittenApproval(handle.db, world.staff, input(approvedOn), signal, NOW)
    expect(await attempt(d('2027-04-14'))).toEqual({ ok: false, error: 'before_vote' })
    expect(await attempt(d('2027-10-01'))).toEqual({ ok: false, error: 'future_date' })
    expect((await attempt(APPROVED)).ok).toBe(true)
    expect(await attempt(APPROVED)).toEqual({ ok: false, error: 'already_recorded' })
  })

  it('is refused for a decision that is not an approval', async () => {
    const made = await decideUnderXx(handle.db, world)
    await handle.db
      .update(boardDecisions)
      .set({ outcome: 'denied' })
      .where(eq(boardDecisions.id, made.decisionId))
    const result = await recordFinalWrittenApproval(
      handle.db,
      world.staff,
      { decisionId: made.decisionId, approvedOn: APPROVED },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'not_approving' })
  })

  it('is refused for an unknown decision', async () => {
    const result = await recordFinalWrittenApproval(
      handle.db,
      world.staff,
      { decisionId: '00000000-0000-4000-8000-000000000000', approvedOn: APPROVED },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('registry recording', () => {
  it('on the due day keeps the clock met and stores the recording', async () => {
    const made = await approved()
    expect((await record(made, DUE)).ok).toBe(true)
    const clock = await voidClock(made.applicationId)
    expect(clock?.status).toBe('met')
    expect(clock?.metOn).toBe(DUE)
    const rows = await handle.db.select().from(decisionRecordings)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ decisionId: made.decisionId, book: '4410', recordedOn: DUE })
  })

  it('dated before the approval is refused', async () => {
    const made = await approved()
    expect(await record(made, addDays(APPROVED, -1))).toEqual({
      ok: false,
      error: 'before_approval',
    })
  })

  it('needs the final written approval first', async () => {
    const made = await decideUnderXx(handle.db, world)
    expect(await record(made, APPROVED)).toEqual({ ok: false, error: 'no_final_written_approval' })
  })

  it('is refused in the future, twice and with a document of another record', async () => {
    const made = await approved()
    expect(await record(made, d('2027-10-01'))).toEqual({ ok: false, error: 'future_date' })
    expect(await record(made, APPROVED, '00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      error: 'document_not_found',
    })
    expect((await record(made, APPROVED)).ok).toBe(true)
    expect(await record(made, APPROVED)).toEqual({ ok: false, error: 'already_recorded' })
  })

  it('dated after the period is refused while the clock is still running', async () => {
    const made = await approved()
    expect(await record(made, addDays(DUE, 1))).toEqual({ ok: false, error: 'after_period' })
    expect((await voidClock(made.applicationId))?.status).toBe('running')
  })

  it('dated after the period is refused once a withdrawal has stopped the clock', async () => {
    const made = await approved()
    await handle.db
      .update(clocks)
      .set({ status: 'stopped' })
      .where(and(eq(clocks.applicationId, made.applicationId), eq(clocks.ruleKey, XX_VOID_KEY)))
    expect(await record(made, addDays(DUE, 1))).toEqual({ ok: false, error: 'after_period' })
    expect(await handle.db.select().from(decisionRecordings)).toHaveLength(0)
    expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('pending_recording')
  })
})

describe('the daily void step', () => {
  it('leaves a clock alone on its due day', async () => {
    const made = await approved()
    expect((await lapse(DUE)).voided).toEqual([])
    expect((await voidClock(made.applicationId))?.status).toBe('running')
  })

  it('lapses an unrecorded clock the day after, keeps the state and skips an open reliance link', async () => {
    const made = await approved()
    await handle.db.insert(relianceLinks).values({
      varianceApplicationId: made.applicationId,
      planningApplicationId: made.applicationId,
    })
    expect((await lapse(addDays(DUE, 1))).voided).toEqual([made.applicationId])
    expect((await voidClock(made.applicationId))?.status).toBe('lapsed')
    expect(await stateOf(made.applicationId)).toBe('decided')
    expect((await lapse(addDays(DUE, 1))).voided).toEqual([])
    expect((await lapse(addDays(DUE, 5))).voided).toEqual([])
  })

  it('lapses a clock the overdue step already flagged', async () => {
    const made = await approved()
    await handle.db
      .update(clocks)
      .set({ status: 'overdue' })
      .where(and(eq(clocks.applicationId, made.applicationId), eq(clocks.ruleKey, XX_VOID_KEY)))
    expect((await lapse(addDays(DUE, 1))).voided).toEqual([made.applicationId])
  })

  it('a recording dated on the due day entered afterwards turns the lapsed clock met', async () => {
    const made = await approved()
    await lapse(addDays(DUE, 1))
    expect((await record(made, DUE)).ok).toBe(true)
    const clock = await voidClock(made.applicationId)
    expect(clock?.status).toBe('met')
    expect(clock?.metOn).toBe(DUE)
  })

  it('a recording dated after the due day entered afterwards is refused and the clock stays lapsed', async () => {
    const made = await approved()
    await lapse(addDays(DUE, 1))
    expect(await record(made, addDays(DUE, 1))).toEqual({ ok: false, error: 'after_period' })
    expect((await voidClock(made.applicationId))?.status).toBe('lapsed')
  })

  it('never lapses a recorded variance', async () => {
    const made = await approved()
    await record(made, DUE)
    expect((await lapse(addDays(DUE, 30))).voided).toEqual([])
  })
})

const EXERCISE_KEY = 'xx.zba.exercise'

const EXERCISE_RULE: PackRule = {
  kind: 'clock',
  key: EXERCISE_KEY,
  version: 1,
  label: 'Variance exercise-by date',
  citation: { label: 'Vellmora Permit Act 15', url: 'https://laws.example/vellmora/permit-act' },
  clockType: 'exercise_by',
  whose: 'applicant',
  startEvent: 'board_vote',
  length: { unit: 'days', value: 60 },
  direction: 'after',
  consequence: { kind: 'lapse', text: 'The variance lapses unless exercised.' },
  extension: { allowed: false, note: 'The act provides no extension.' },
  waivable: false,
  overridePolicy: { policy: 'fixed' },
}

describe('the daily job when the variance also lapses', () => {
  it('marks the variance void before its expiry stops the void clock', async () => {
    const rules = [...XX_RECORDING.manifest.rules, EXERCISE_RULE]
    setActivePackForTest(
      xxPackWith({
        manifest: { ...XX_RECORDING.manifest, rules },
        pack: { ruleAreas: [{ title: 'All rules', rules }] },
      }),
    )
    try {
      const made = await approved()
      const voidRow = await voidClock(made.applicationId)
      if (voidRow === undefined) throw new Error('missing void clock')
      const { id: _id, createdAt: _createdAt, ...copy } = voidRow
      await handle.db.insert(clocks).values({ ...copy, ruleKey: EXERCISE_KEY, currentDue: DUE })
      const ran = await runJob(handle.db, clocksDailyJob, { today: addDays(DUE, 1) }, signal)
      expect(ran.ok).toBe(true)
      expect(await stateOf(made.applicationId)).toBe('expired')
      expect((await voidClock(made.applicationId))?.status).toBe('lapsed')
      expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('void')
    } finally {
      setActivePackForTest(XX_RECORDING)
    }
  })
})
