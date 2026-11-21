import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks, noticeItems, noticeSets } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { loadBoardPanel } from '@/features/boards/panelData'
import { recordDecision } from '@/features/decisions/recordDecision'
import { continueHearing } from '@/features/hearings/continuations'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { earliestNoticeDue } from '@/features/notices/noticeDue'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { recordProof } from '@/features/notices/proofs'
import { prepareReceiptNotices } from '@/features/notices/receiptNotices'
import { planRequirement } from '@/features/notices/requirementPlan'
import { setActivePackForTest } from '@/features/packs/registry'
import {
  type BoardWorld,
  boardIdSql,
  boardTypeBody,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES } from '@/test/hearingFixtures'
import {
  issueListWithRecipients,
  proofDocument,
  proveEverything,
  recipient,
} from '@/test/noticeFixtures'
import {
  XX_HEARING_MAIL_KEY,
  XX_PB_SUBDIVISION_KEY,
  XX_RECEIPT_LEAD_KEY,
  XX_RECEIPT_MAIL_KEY,
  XX_RECEIPT_NOTICES,
} from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const RECEIVED = '2027-03-02'
const RECEIPT_DUE = '2027-03-09'
const NOW = new Date('2027-04-10T16:00:00Z')
let handle: TestDb
let world: BoardWorld

async function meetingOn(date: string): Promise<string> {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and: both, eq: same }) =>
      both(same(m.meetingDate, date), same(m.boardId, boardIdSql('planning_board'))),
  })
  return rows[0]?.id ?? ''
}

async function receivedApplication(): Promise<string> {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, RECEIVED)
  await issueListWithRecipients(handle.db, world, id, [
    recipient(1),
    recipient(2),
    recipient(3, ['municipal_clerk']),
  ])
  return id
}

async function itemsOf(setId: string) {
  return await handle.db.select().from(noticeItems).where(eq(noticeItems.setId, setId))
}

async function prepared(applicationId: string): Promise<string> {
  const result = await prepareReceiptNotices(handle.db, world.staff, { applicationId }, signal)
  if (!result.ok) throw new Error(`prepare failed: ${JSON.stringify(result.error)}`)
  return result.value.noticeSetId
}

async function leadClock(applicationId: string) {
  const [clock] = await handle.db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, XX_RECEIPT_LEAD_KEY)))
  return clock
}

beforeAll(() => {
  setActivePackForTest(XX_RECEIPT_NOTICES)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    pack: XX_RECEIPT_NOTICES,
    classificationKey: XX_PB_SUBDIVISION_KEY,
  })
})
afterEach(async () => {
  await handle.drop()
})

describe('prepareReceiptNotices', () => {
  it('derives one item per abutter and per clerk, each due the lead after receipt', async () => {
    const id = await receivedApplication()
    const setId = await prepared(id)
    const items = await itemsOf(setId)
    expect(items.map((i) => i.recipientName).sort()).toEqual([
      'Recipient 1',
      'Recipient 2',
      'Recipient 3',
    ])
    expect(
      items.every((i) => i.requirementKey === XX_RECEIPT_MAIL_KEY && i.dueOn === RECEIPT_DUE),
    ).toBe(true)
    const [set] = await handle.db.select().from(noticeSets).where(eq(noticeSets.id, setId))
    expect(set).toMatchObject({
      subjectKind: 'receipt',
      subjectId: id,
      applicationId: id,
      anchorDate: RECEIVED,
    })
  })

  it('refuses a second preparation', async () => {
    const id = await receivedApplication()
    await prepared(id)
    expect(
      await prepareReceiptNotices(handle.db, world.staff, { applicationId: id }, signal),
    ).toEqual({
      ok: false,
      error: 'already_prepared',
    })
    expect(
      await handle.db.select().from(noticeSets).where(eq(noticeSets.subjectKind, 'receipt')),
    ).toHaveLength(1)
  })

  it('asks for an issued list first', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, RECEIVED)
    expect(
      await prepareReceiptNotices(handle.db, world.staff, { applicationId: id }, signal),
    ).toEqual({
      ok: false,
      error: 'no_issued_list',
    })
  })

  it('refuses a classification with no receipt requirement', async () => {
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'ZBX',
      boardTypeBody('xx.board_variance', 'ZBX', 'ZX', {}, XX_RECEIPT_NOTICES),
    )
    const id = await submitBoardApplication(handle.db, world, 'ZBX', RECEIVED)
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    expect(
      await prepareReceiptNotices(handle.db, world.staff, { applicationId: id }, signal),
    ).toEqual({
      ok: false,
      error: 'no_receipt_requirements',
    })
  })

  it('refuses a person without the board.record capability', async () => {
    const id = await receivedApplication()
    expect(
      await prepareReceiptNotices(handle.db, world.applicant, { applicationId: id }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('does not find an application that does not exist', async () => {
    expect(
      await prepareReceiptNotices(
        handle.db,
        world.staff,
        { applicationId: '00000000-0000-4000-8000-000000000000' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
  })

  it('marks the lead clock met on the latest proof date once every item is proved', async () => {
    const id = await receivedApplication()
    const before = await leadClock(id)
    expect(before).toMatchObject({ status: 'running', currentDue: RECEIPT_DUE })
    const setId = await prepared(id)
    await proveEverything(handle.db, world, id, setId, d('2027-03-08'), NOW)
    expect(await leadClock(id)).toMatchObject({ status: 'met', metOn: '2027-03-08' })
  })

  it('leaves the lead clock running while an item has no proof', async () => {
    const id = await receivedApplication()
    const setId = await prepared(id)
    const [first] = await itemsOf(setId)
    const proved = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: [first?.id ?? ''],
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-03-08'),
        documentId: await proofDocument(handle.db, world, id),
      },
      signal,
      NOW,
    )
    expect(proved.ok).toBe(true)
    expect((await leadClock(id))?.status).toBe('running')
  })
})

describe('the receipt notices section of the board panel', () => {
  it('offers to prepare once a list is issued, then lists the notices', async () => {
    const id = await receivedApplication()
    const before = (await loadBoardPanel(handle.db, world.staff, id, signal))?.receipt
    expect(before).toMatchObject({ canPrepare: true, prepared: false, checklist: [] })
    await prepared(id)
    const after = (await loadBoardPanel(handle.db, world.staff, id, signal))?.receipt
    expect(after).toMatchObject({ canPrepare: false, prepared: true })
    expect(after?.checklist).toHaveLength(3)
    expect(after?.itemChoices).toHaveLength(3)
  })

  it('does not offer to prepare before a list is issued', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, RECEIVED)
    const panel = (await loadBoardPanel(handle.db, world.staff, id, signal))?.receipt
    expect(panel).toMatchObject({ canPrepare: false, prepared: false })
  })

  it('is absent for a classification with no receipt requirement', async () => {
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'ZBX',
      boardTypeBody('xx.board_variance', 'ZBX', 'ZX', {}, XX_RECEIPT_NOTICES),
    )
    const id = await submitBoardApplication(handle.db, world, 'ZBX', RECEIVED)
    expect((await loadBoardPanel(handle.db, world.staff, id, signal))?.receipt).toBeNull()
  })
})

describe('planRequirement for the receipt stage', () => {
  const rule = XX_RECEIPT_NOTICES.manifest.rules.find((r) => r.key === XX_RECEIPT_MAIL_KEY)
  const input = {
    hearingDate: d(RECEIVED),
    flags: { regionalImpact: false, desWithin: false },
    townLeadDays: {},
    publicChoice: null,
  }

  it('plans the lead after the received date when the stage is on_receipt', () => {
    if (rule?.kind !== 'notice_requirement') throw new Error('no rule')
    expect(planRequirement(rule, { ...input, stage: 'on_receipt' })).toMatchObject({
      channel: 'verified_mail',
      dueOn: RECEIPT_DUE,
      leadDays: 7,
    })
  })

  it('plans nothing for it when the stage is before_hearing', () => {
    if (rule?.kind !== 'notice_requirement') throw new Error('no rule')
    expect(planRequirement(rule, input)).toBeNull()
    expect(planRequirement(rule, { ...input, stage: 'before_hearing' })).toBeNull()
  })
})

describe('hearing notices beside a receipt set', () => {
  async function underReview(): Promise<string> {
    const id = await receivedApplication()
    await prepared(id)
    await handle.db
      .update(applications)
      .set({ state: 'under_review' })
      .where(eq(applications.id, id))
    return id
  }

  it('scheduling a hearing derives only the before-hearing requirements', async () => {
    const id = await underReview()
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: await meetingOn('2027-04-14'), kind: 'public_hearing' },
      signal,
    )
    expect(scheduled.ok).toBe(true)
    const [hearing] = await handle.db.query.hearings.findMany({
      where: (h, { eq: same }) => same(h.applicationId, id),
    })
    const items = await itemsOf(hearing?.noticeSetId ?? '')
    expect(items.map((i) => i.requirementKey)).toEqual([XX_HEARING_MAIL_KEY, XX_HEARING_MAIL_KEY])
    expect(items.every((i) => i.dueOn === '2027-04-04')).toBe(true)
  })

  it('continuing a hearing derives only the before-hearing requirements', async () => {
    const id = await underReview()
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: await meetingOn('2027-04-14'), kind: 'public_hearing' },
      signal,
    )
    if (!scheduled.ok) throw new Error('schedule failed')
    const continued = await continueHearing(
      handle.db,
      world.staff,
      {
        hearingId: scheduled.value.hearingId,
        toMeetingId: await meetingOn('2027-04-28'),
        announcedAtMeeting: false,
      },
      signal,
    )
    expect(continued.ok).toBe(true)
    if (!continued.ok) return
    const [next] = await handle.db.query.hearings.findMany({
      where: (h, { eq: same }) => same(h.id, continued.value.hearingId),
    })
    const items = await itemsOf(next?.noticeSetId ?? '')
    expect(items.map((i) => i.requirementKey)).toEqual([XX_HEARING_MAIL_KEY, XX_HEARING_MAIL_KEY])
    expect(items.every((i) => i.dueOn === '2027-04-18')).toBe(true)
  })

  it('marks the hearing noticed and held while the receipt set has unproved items', async () => {
    const id = await underReview()
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: await meetingOn('2027-04-14'), kind: 'public_hearing' },
      signal,
    )
    if (!scheduled.ok) throw new Error('schedule failed')
    const [hearing] = await handle.db.query.hearings.findMany({
      where: (h, { eq: same }) => same(h.id, scheduled.value.hearingId),
    })
    const now = new Date('2027-04-14T16:00:00Z')
    await proveEverything(handle.db, world, id, hearing?.noticeSetId ?? '', d('2027-04-01'), now)
    expect(
      (await markProperlyNoticed(handle.db, world.staff, scheduled.value.hearingId, signal, now))
        .ok,
    ).toBe(true)
    const held = await markHearingHeld(
      handle.db,
      world.staff,
      { hearingId: scheduled.value.hearingId, heldOn: d('2027-04-14') },
      signal,
      now,
    )
    expect(held.ok).toBe(true)
    const [receiptSet] = await handle.db
      .select()
      .from(noticeSets)
      .where(eq(noticeSets.subjectKind, 'receipt'))
    const receiptStatus = await noticeStatus(handle.db, receiptSet?.id ?? '', signal)
    expect(receiptStatus.items.every((i) => i.state === 'missing')).toBe(true)
  })

  it('the earliest notice due ignores the receipt requirement', async () => {
    const id = await receivedApplication()
    const app = await loadApplicationContext(handle.db, id, signal)
    if (app === null) throw new Error('no application')
    const due = await earliestNoticeDue(handle.db, app, signal)
    expect(due(d('2027-04-14'))).toBe('2027-04-04')
    expect(due(d('2027-03-01'))).toBe('2027-02-19')
  })

  it('a decision without a hearing records while the receipt set is open', async () => {
    const id = await underReview()
    const recorded = await recordDecision(
      handle.db,
      world.staff,
      {
        applicationId: id,
        hearingId: null,
        meetingId: await meetingOn('2027-04-14'),
        votedOn: d('2027-04-14'),
        outcome: 'approved',
        motion: 'Move to approve as presented.',
        votes: FIXTURE_VOTES,
        findings: 'The proposal meets each criterion of the ordinance.',
      },
      signal,
      new Date('2028-01-03T16:00:00Z'),
    )
    expect(recorded.ok).toBe(true)
  })
})
