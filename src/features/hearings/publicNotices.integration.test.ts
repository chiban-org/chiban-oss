import { sql } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { users } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { boardSettingsDefault } from '@/features/boards/boardSettingsSchema'
import { activeBoards } from '@/features/boards/townBoards'
import { continueHearing } from '@/features/hearings/continuations'
import { loadPublicHearingNotices, renderPublicNoticePdf } from '@/features/hearings/publicNotices'
import { postNoticeOnWebsite } from '@/features/hearings/websitePosting'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { endApplication } from '@/features/portal/endApplication'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { scheduledZbaHearing } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const day = (s: string) => s as CivilDate
const BEFORE = day('2027-04-01')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15', '2027-04-29'] })
})
afterEach(async () => {
  await handle.drop()
})

async function withTownWebsite(): Promise<void> {
  const defaults = boardSettingsDefault(await activeBoards(handle.db))
  await saveAndPublish(handle.db, world.admin, 'board_settings', 'default', {
    ...defaults,
    boards: defaults.boards.map((b) => ({
      ...b,
      publicNotice: { ...b.publicNotice, websiteUrl: 'https://alderpond.example.org' },
    })),
  })
}

describe('public hearing notice listing', () => {
  it('lists a scheduled hearing with the board, date, place, applicant, address and notice text', async () => {
    await scheduledZbaHearing(handle.db, world)
    await handle.db.execute(sql`update parcels set site_address = '14 Mill Road'`)
    const [notice] = await loadPublicHearingNotices(handle.db, BEFORE, signal)
    expect(notice?.boardShortName).toBeTruthy()
    expect(notice?.meetingDate).toBe('2027-04-15')
    expect(notice?.kindLabel).toBe('Public hearing')
    expect(notice?.withdrawn).toBe(false)
    expect(notice?.parcelAddress).toBe('14 Mill Road')
    expect(notice?.applicationNumber).toMatch(/^VAR-/)
    expect(notice?.paragraphs.join(' ')).toContain('will hold a Public hearing on')
  })

  it('exposes no applicant email, phone or recipient address beyond the notice itself', async () => {
    await scheduledZbaHearing(handle.db, world)
    const emails = (await handle.db.select({ email: users.email }).from(users)).map((u) => u.email)
    const listed = JSON.stringify(await loadPublicHearingNotices(handle.db, BEFORE, signal))
    for (const email of emails) expect(listed).not.toContain(email)
    expect(listed).not.toContain('Heron Lane')
    expect(listed).not.toContain('Recipient 1')
  })

  it('shows a continued hearing once, at its new date', async () => {
    const hearing = await scheduledZbaHearing(handle.db, world)
    const [later] = await handle.db.query.boardMeetings.findMany({
      where: (m, { eq: same }) => same(m.meetingDate, '2027-04-29'),
    })
    const continued = await continueHearing(
      handle.db,
      world.staff,
      {
        hearingId: hearing.hearingId,
        toMeetingId: later?.id ?? '',
        announcedAtMeeting: false,
      },
      signal,
    )
    expect(continued.ok).toBe(true)
    const notices = await loadPublicHearingNotices(handle.db, BEFORE, signal)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.meetingDate).toBe('2027-04-29')
    expect(notices[0]?.continuedFromDate).toBe('2027-04-15')
  })

  it('replaces a withdrawn hearing with a withdrawn line until its date passes', async () => {
    const hearing = await scheduledZbaHearing(handle.db, world)
    const app = await loadApplicationContext(handle.db, hearing.applicationId, signal)
    const ended = await endApplication(
      handle.db,
      world.applicant,
      {
        applicationId: hearing.applicationId,
        expectedRowVersion: app?.rowVersion ?? 0,
        ending: 'withdraw',
      },
      signal,
    )
    expect(ended.ok).toBe(true)
    const [withdrawn] = await loadPublicHearingNotices(handle.db, BEFORE, signal)
    expect(withdrawn?.withdrawn).toBe(true)
    expect(withdrawn?.paragraphs).toEqual([])
    expect(withdrawn?.applicantName).toBe('')
    expect(await loadPublicHearingNotices(handle.db, day('2027-04-15'), signal)).toHaveLength(1)
    expect(await loadPublicHearingNotices(handle.db, day('2027-04-16'), signal)).toEqual([])
    expect(await renderPublicNoticePdf(handle.db, hearing.hearingId, BEFORE, signal)).toBeNull()
  })

  it('stops listing a hearing the day after its meeting', async () => {
    await scheduledZbaHearing(handle.db, world)
    expect(await loadPublicHearingNotices(handle.db, day('2027-04-16'), signal)).toEqual([])
  })
})

describe('printable bulletin board notice', () => {
  it('is a one page PDF carrying the notice text', async () => {
    const hearing = await scheduledZbaHearing(handle.db, world)
    const bytes = await renderPublicNoticePdf(handle.db, hearing.hearingId, BEFORE, signal)
    if (bytes === null) throw new Error('no pdf')
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    const words = await pdfWording(bytes)
    expect(words).toContain('Public hearing')
    expect(words).toContain('2027')
  })

  it('is absent for a hearing that is not on the board', async () => {
    const hearing = await scheduledZbaHearing(handle.db, world)
    expect(
      await renderPublicNoticePdf(handle.db, hearing.hearingId, day('2027-04-16'), signal),
    ).toBeNull()
    expect(
      await renderPublicNoticePdf(
        handle.db,
        '00000000-0000-4000-8000-000000000000',
        BEFORE,
        signal,
      ),
    ).toBeNull()
  })
})

describe('website posting proof', () => {
  it('records the website proof on the day it went live and leaves the bulletin board to staff', async () => {
    await withTownWebsite()
    const hearing = await scheduledZbaHearing(handle.db, world)
    const { store } = await makeTestStore()
    const now = new Date('2027-04-02T15:00:00Z')
    const posted = await postNoticeOnWebsite(
      handle.db,
      world.staff,
      { hearingId: hearing.hearingId, store, now },
      signal,
    )
    expect(posted).toEqual({ ok: true, value: { itemsProved: 1 } })
    const status = await noticeStatus(handle.db, hearing.noticeSetId, signal)
    const website = status.items.filter((i) => i.channel === 'website')
    expect(website).toHaveLength(1)
    expect(website[0]?.proof?.method).toBe('website_posting')
    expect(website[0]?.proof?.effectiveOn).toBe('2027-04-02')
    const others = status.items.filter((i) => i.channel !== 'website')
    expect(others.every((i) => i.proof === null)).toBe(true)
  })

  it('does nothing the second time', async () => {
    await withTownWebsite()
    const hearing = await scheduledZbaHearing(handle.db, world)
    const { store } = await makeTestStore()
    const now = new Date('2027-04-02T15:00:00Z')
    await postNoticeOnWebsite(
      handle.db,
      world.staff,
      { hearingId: hearing.hearingId, store, now },
      signal,
    )
    const again = await postNoticeOnWebsite(
      handle.db,
      world.staff,
      { hearingId: hearing.hearingId, store, now },
      signal,
    )
    expect(again).toEqual({ ok: true, value: { itemsProved: 0 } })
  })

  it('does nothing when the town has no website item', async () => {
    const hearing = await scheduledZbaHearing(handle.db, world)
    const { store } = await makeTestStore()
    const posted = await postNoticeOnWebsite(
      handle.db,
      world.staff,
      { hearingId: hearing.hearingId, store },
      signal,
    )
    expect(posted).toEqual({ ok: true, value: { itemsProved: 0 } })
  })

  it('refuses a user without board recording rights', async () => {
    const hearing = await scheduledZbaHearing(handle.db, world)
    const { store } = await makeTestStore()
    const posted = await postNoticeOnWebsite(
      handle.db,
      world.applicant,
      { hearingId: hearing.hearingId, store },
      signal,
    )
    expect(posted).toEqual({ ok: false, error: 'forbidden' })
  })
})
