import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { boardSettingsDefault } from '@/features/boards/boardSettingsSchema'
import { activeBoards } from '@/features/boards/townBoards'
import { noticeStatus } from '@/features/notices/noticeStatus'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { meetingIdOn } from '@/test/boardPanelFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { scheduledZbaHearing } from '@/test/hearingFixtures'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./actions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal
const TODAY = new Date('2027-04-01T16:00:00Z')
let world: BoardWorld

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TODAY })
  world = await setupBoardWorld(h.db, { zbaMeetings: ['2027-04-15', '2027-05-20'] })
  const defaults = boardSettingsDefault(await activeBoards(h.db))
  await saveAndPublish(h.db, world.admin, 'board_settings', 'default', {
    ...defaults,
    boards: defaults.boards.map((b) => ({
      ...b,
      publicNotice: { ...b.publicNotice, websiteUrl: 'https://alderpond.example.org' },
    })),
  })
})
afterAll(() => {
  vi.useRealTimers()
})

async function websiteItems(noticeSetId: string) {
  const status = await noticeStatus(h.db, noticeSetId, signal)
  return status.items.filter((i) => i.channel === 'website')
}

describe('website posting when a hearing is scheduled or continued', () => {
  it('scheduling records the website proof dated today and says so', async () => {
    h.signIn(await h.actorFor('admin'))
    const applicationId = await submitBoardApplication(h.db, world, world.zbaTypeKey, '2027-03-02')
    await recordNoRegionalImpact(h.db, world, applicationId)
    await issueListWithRecipients(h.db, world, applicationId, [recipient(1)])
    const form = h.form({
      applicationId,
      meetingId: await meetingIdOn(h.db, '2027-04-15', 'zba'),
      kind: 'public_hearing',
    })
    const result = await actions.scheduleHearingAction(form)
    expect(result).toEqual({
      ok: true,
      message:
        'Hearing scheduled. The notice checklist is ready. The notice is on the public meetings page and the website posting is recorded.',
    })
    const [hearing] = await h.db.query.hearings.findMany({
      where: (t, { eq }) => eq(t.applicationId, applicationId),
    })
    const [item] = await websiteItems(hearing?.noticeSetId ?? '')
    expect(item?.proof?.method).toBe('website_posting')
    expect(item?.proof?.effectiveOn).toBe('2027-04-01')
  })

  it('continuing with new notice records the website proof for the new date', async () => {
    h.signIn(await h.actorFor('admin'))
    const hearing = await scheduledZbaHearing(h.db, world)
    const form = h.form({
      hearingId: hearing.hearingId,
      toMeetingId: await meetingIdOn(h.db, '2027-05-20', 'zba'),
      announced: 'no',
    })
    const result = await actions.continueHearingAction(form)
    expect(result).toMatchObject({ ok: true })
    const [next] = await h.db.query.hearings.findMany({
      where: (t, { eq }) => eq(t.continuedFrom, hearing.hearingId),
    })
    const [item] = await websiteItems(next?.noticeSetId ?? '')
    expect(item?.proof?.method).toBe('website_posting')
  })
})
