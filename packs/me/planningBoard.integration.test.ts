import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  ACCEPTANCE_MEETING,
  acceptAtMeeting,
  clocksOf,
  decideSubdivision,
  HEARING_MEETING,
  holdSubdivisionHearing,
  itemsOf,
  preparedReceipt,
  proveReceipt,
  publishSubdivisionType,
  RECEIVED,
  receivedSubdivision,
  scheduleSubdivisionHearing,
} from '@/test/maineSubdivisionFixtures'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const RECEIPT_MAIL = 'me.pb.notice.receipt_mail'
const RECEIPT_WATER = 'me.pb.notice.receipt_water'
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  setActivePackForTest(ME_PACK)
  await publishSubdivisionType(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function clock(id: string, key: string) {
  return await clocksOf(handle.db, id, key)
}

async function acceptedWithReceiptProved(water: 'within' | 'not_within' = 'not_within') {
  const id = await receivedSubdivision(handle.db, world, water)
  const setId = await preparedReceipt(handle.db, world, id)
  await proveReceipt(handle.db, world, id, setId)
  await acceptAtMeeting(handle.db, world, id)
  return { id, setId }
}

describe('a Maine subdivision on receipt', () => {
  it('starts the completeness and receipt notice clocks', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    expect(await clock(id, 'me.pb.completeness')).toMatchObject([
      { status: 'running', startDate: RECEIVED, currentDue: '2027-04-01' },
    ])
    expect(await clock(id, 'me.pb.receipt_notice')).toMatchObject([
      { status: 'running', startDate: RECEIVED, currentDue: '2027-03-09' },
    ])
  })

  it('mails the abutters, the clerk and the reviewing authority, not the applicant', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    const items = await itemsOf(handle.db, await preparedReceipt(handle.db, world, id))
    expect(items.map((i) => i.recipientName).sort()).toEqual([
      'Recipient 1',
      'Recipient 2',
      'Recipient 3',
      'Recipient 4',
    ])
    expect(
      items.every(
        (i) =>
          i.requirementKey === RECEIPT_MAIL &&
          i.channel === 'first_class_mail' &&
          i.dueOn === '2027-03-09',
      ),
    ).toBe(true)
  })

  it('adds the water supplier when the subdivision is within its source water area', async () => {
    const id = await receivedSubdivision(handle.db, world, 'within')
    const items = await itemsOf(handle.db, await preparedReceipt(handle.db, world, id))
    expect(items.filter((i) => i.requirementKey === RECEIPT_WATER)).toMatchObject([
      { recipientName: 'Recipient 6', channel: 'first_class_mail', dueOn: '2027-03-09' },
    ])
    expect(items.filter((i) => i.requirementKey === RECEIPT_MAIL)).toHaveLength(4)
  })

  it('meets the receipt notice clock once every notice is proved', async () => {
    const { id } = await acceptedWithReceiptProved()
    expect(await clock(id, 'me.pb.receipt_notice')).toMatchObject([
      { status: 'met', metOn: '2027-03-08' },
    ])
    expect(await clock(id, 'me.pb.completeness')).toMatchObject([
      { status: 'met', metOn: ACCEPTANCE_MEETING },
    ])
  })
})

describe('a Maine subdivision decided without a hearing', () => {
  it('keeps the receipt notices proved and meets the 60-day clock', async () => {
    const { id, setId } = await acceptedWithReceiptProved()
    expect(await clock(id, 'me.pb.decision_no_hearing')).toMatchObject([
      { status: 'running', startDate: ACCEPTANCE_MEETING, currentDue: '2027-05-23' },
    ])
    expect((await decideSubdivision(handle.db, world, id, null)).ok).toBe(true)
    expect(await clock(id, 'me.pb.decision_no_hearing')).toMatchObject([
      { status: 'met', metOn: HEARING_MEETING },
    ])
    expect(await clock(id, 'me.pb.hearing_window')).toEqual([])
    expect(await clock(id, 'me.pb.decision_after_hearing')).toEqual([])
    const receipt = await noticeStatus(handle.db, setId, signal)
    expect(receipt.items).toHaveLength(4)
    expect(receipt.items.every((i) => i.state === 'proved_on_time')).toBe(true)
  })
})

describe('a Maine subdivision with a hearing', () => {
  it('shows the hearing window, anchored at completeness, once a hearing is scheduled', async () => {
    const { id } = await acceptedWithReceiptProved()
    expect(await clock(id, 'me.pb.hearing_window')).toEqual([])
    await scheduleSubdivisionHearing(handle.db, world, id)
    expect(await clock(id, 'me.pb.hearing_window')).toMatchObject([
      {
        status: 'running',
        startEvent: 'application_accepted',
        startDate: ACCEPTANCE_MEETING,
        currentDue: '2027-04-23',
      },
    ])
  })

  it('notices the hearing twice in the newspaper, once to the applicant, and posts with the first', async () => {
    const { id } = await acceptedWithReceiptProved()
    const hearing = await scheduleSubdivisionHearing(handle.db, world, id)
    const items = (await itemsOf(handle.db, hearing.noticeSetId)).filter(
      (i) => i.source === 'pack_rule',
    )
    expect(
      items.map((i) => [i.requirementKey, i.channel, i.recipientName, i.dueOn]).sort(),
    ).toEqual([
      ['me.pb.notice.applicant', 'first_class_mail', 'Recipient 5', '2027-04-07'],
      ['me.pb.notice.hearing_first', 'newspaper', null, '2027-04-07'],
      ['me.pb.notice.hearing_second', 'newspaper', null, '2027-04-13'],
    ])
    const postings = (await itemsOf(handle.db, hearing.noticeSetId)).filter(
      (i) => i.source === 'town_setting',
    )
    expect(postings.length).toBeGreaterThan(0)
    expect(postings.every((i) => i.dueOn === '2027-04-07')).toBe(true)
  })

  it('cancels the 60-day clock and starts the 30-day clock when the hearing is held', async () => {
    const { id } = await acceptedWithReceiptProved()
    const hearing = await scheduleSubdivisionHearing(handle.db, world, id)
    await holdSubdivisionHearing(handle.db, world, id, hearing)
    expect(await clock(id, 'me.pb.hearing_window')).toMatchObject([
      { status: 'met', metOn: HEARING_MEETING },
    ])
    expect(await clock(id, 'me.pb.decision_no_hearing')).toMatchObject([
      { status: 'superseded', supersededReason: 'cancelled_by_event' },
    ])
    expect(await clock(id, 'me.pb.decision_after_hearing')).toMatchObject([
      {
        status: 'running',
        startEvent: 'hearing_held',
        startDate: HEARING_MEETING,
        currentDue: '2027-05-14',
      },
    ])
    expect((await decideSubdivision(handle.db, world, id, hearing.hearingId)).ok).toBe(true)
    expect(await clock(id, 'me.pb.decision_after_hearing')).toMatchObject([
      { status: 'met', metOn: HEARING_MEETING },
    ])
  })
})
