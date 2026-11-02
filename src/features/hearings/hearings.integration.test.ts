import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acceptanceSchedules, applications, clocks, hearings, noticeItems } from '@/db/schema'
import { publishConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'
import { continueHearing } from '@/features/hearings/continuations'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { renderNoticeLetters } from '@/features/hearings/noticeLetters'
import { noticeStatus } from '@/features/notices/noticeStatus'
import {
  type BoardWorld,
  boardTypeBody,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  issueListWithRecipients,
  proveEverything,
  recipient,
  recordDesProximity,
} from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-04-10T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15', '2027-04-29'] })
})
afterEach(async () => {
  await handle.drop()
})

async function meetingIdOn(date: string, board: 'planning_board' | 'zba') {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) => and(equals(m.meetingDate, date), equals(m.board, board)),
  })
  return rows[0]?.id ?? ''
}

async function zbaApp(options: { list?: boolean; recipients?: number } = {}) {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id)
  if (options.list !== false) {
    await issueListWithRecipients(
      handle.db,
      world,
      id,
      Array.from({ length: options.recipients ?? 2 }, (_, i) => recipient(i + 1)),
    )
  }
  return id
}

async function pbApp() {
  const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
  await recordNoRegionalImpact(handle.db, world, id)
  await recordDesProximity(handle.db, world, id, 'not_within')
  await issueListWithRecipients(handle.db, world, id, [recipient(1), recipient(2)])
  return id
}

async function schedule(
  applicationId: string,
  date: string,
  board: 'planning_board' | 'zba',
  kind: 'public_hearing' | 'submission_and_hearing' = 'public_hearing',
) {
  const scheduled = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId, meetingId: await meetingIdOn(date, board), kind },
    signal,
  )
  if (!scheduled.ok) throw new Error(`schedule failed: ${JSON.stringify(scheduled.error)}`)
  return scheduled.value.hearingId
}

async function hearingRow(id: string) {
  const [row] = await handle.db.select().from(hearings).where(eq(hearings.id, id))
  if (row === undefined) throw new Error('no hearing')
  return row
}

async function applicationRow(id: string) {
  const [row] = await handle.db.select().from(applications).where(eq(applications.id, id))
  return row
}

describe('scheduleHearing', () => {
  it('zba hearing on 2027-04-15 moves the application to under_review substep hearing', async () => {
    const id = await zbaApp()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    expect(await applicationRow(id)).toMatchObject({ state: 'under_review', substep: 'hearing' })
    const row = await hearingRow(hearingId)
    expect(row).toMatchObject({ status: 'scheduled', kind: 'public_hearing' })
    const items = await handle.db
      .select()
      .from(noticeItems)
      .where(eq(noticeItems.setId, row.noticeSetId))
    expect(items.some((i) => i.requirementKey === 'nh.zba.notice_req.newspaper')).toBe(true)
  })

  it('zba hearing without an issued list is no_issued_list and changes nothing', async () => {
    const id = await zbaApp({ list: false })
    const result = await scheduleHearing(
      handle.db,
      world.staff,
      {
        applicationId: id,
        meetingId: await meetingIdOn('2027-04-15', 'zba'),
        kind: 'public_hearing',
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'no_issued_list' })
    expect((await applicationRow(id))?.state).toBe('submitted')
    expect(await handle.db.select().from(hearings)).toEqual([])
  })

  it('a planning board submission hearing sets the acceptance meeting', async () => {
    const id = await pbApp()
    await schedule(id, '2027-04-14', 'planning_board', 'submission_and_hearing')
    const [row] = await handle.db
      .select()
      .from(acceptanceSchedules)
      .where(eq(acceptanceSchedules.applicationId, id))
    expect(row?.meetingId).toBe(await meetingIdOn('2027-04-14', 'planning_board'))
  })

  it('a planning board submission filed too late for the meeting is refused', async () => {
    const id = await pbApp()
    const result = await scheduleHearing(
      handle.db,
      world.staff,
      {
        applicationId: id,
        meetingId: await meetingIdOn('2027-03-24', 'planning_board'),
        kind: 'submission_and_hearing',
      },
      signal,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toHaveProperty('filedTooLate')
    expect(await handle.db.select().from(hearings)).toEqual([])
  })

  it('a meeting of the other board is wrong_board', async () => {
    const id = await zbaApp()
    const result = await scheduleHearing(
      handle.db,
      world.staff,
      {
        applicationId: id,
        meetingId: await meetingIdOn('2027-04-14', 'planning_board'),
        kind: 'public_hearing',
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'wrong_board' })
  })

  it('a reviewer scheduling a hearing is forbidden', async () => {
    const id = await zbaApp()
    const result = await scheduleHearing(
      handle.db,
      world.reviewer,
      {
        applicationId: id,
        meetingId: await meetingIdOn('2027-04-15', 'zba'),
        kind: 'public_hearing',
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(await handle.db.select().from(hearings)).toEqual([])
  })
})

describe('proper notice and holding', () => {
  it('properly noticed is refused while an item is missing', async () => {
    const id = await zbaApp()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    const result = await markProperlyNoticed(handle.db, world.staff, hearingId, signal)
    expect(result.ok).toBe(false)
    if (!result.ok && typeof result.error !== 'string') {
      expect(result.error.notProperlyNoticed.length).toBeGreaterThan(0)
    } else {
      expect.fail('expected a notProperlyNoticed list')
    }
    expect((await hearingRow(hearingId)).properlyNoticedAt).toBeNull()
  })

  it('held is refused before properly noticed', async () => {
    const id = await zbaApp()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    const result = await markHearingHeld(
      handle.db,
      world.staff,
      { hearingId, heldOn: d('2027-04-15') },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_properly_noticed' })
    expect((await hearingRow(hearingId)).status).toBe('scheduled')
  })

  it('held on 2027-04-15 meets the hearing clock due 2027-04-16', async () => {
    const id = await zbaApp()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    const row = await hearingRow(hearingId)
    await proveEverything(handle.db, world, id, row.noticeSetId, d('2027-04-01'), NOW)
    expect((await markProperlyNoticed(handle.db, world.staff, hearingId, signal)).ok).toBe(true)
    expect((await hearingRow(hearingId)).properlyNoticedBy).toBe(world.staff.userId)
    const held = await markHearingHeld(
      handle.db,
      world.staff,
      { hearingId, heldOn: d('2027-04-15') },
      signal,
    )
    expect(held.ok).toBe(true)
    expect(await hearingRow(hearingId)).toMatchObject({ status: 'held', heldOn: '2027-04-15' })
    const [clock] = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, id))
      .then((rows) => rows.filter((c) => c.ruleKey === 'nh.zba.hearing'))
    expect(clock).toMatchObject({ status: 'met', metOn: '2027-04-15', currentDue: '2027-04-16' })
  })

  it('a proof replaced by a late one blocks holding the hearing', async () => {
    const id = await zbaApp()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    const row = await hearingRow(hearingId)
    await proveEverything(handle.db, world, id, row.noticeSetId, d('2027-04-01'), NOW)
    await markProperlyNoticed(handle.db, world.staff, hearingId, signal)
    await proveEverything(
      handle.db,
      world,
      id,
      row.noticeSetId,
      d('2027-04-14'),
      new Date('2027-04-14T16:00:00Z'),
    )
    const held = await markHearingHeld(
      handle.db,
      world.staff,
      { hearingId, heldOn: d('2027-04-15') },
      signal,
    )
    expect(held).toEqual({ ok: false, error: 'not_properly_noticed' })
  })

  it('a reviewer marking held or noticed is forbidden', async () => {
    const id = await zbaApp()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    expect(await markProperlyNoticed(handle.db, world.reviewer, hearingId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await markHearingHeld(
        handle.db,
        world.reviewer,
        { hearingId, heldOn: d('2027-04-15') },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('continueHearing', () => {
  async function noticedHearing() {
    const id = await zbaApp()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    const row = await hearingRow(hearingId)
    await proveEverything(handle.db, world, id, row.noticeSetId, d('2027-04-01'), NOW)
    await markProperlyNoticed(handle.db, world.staff, hearingId, signal)
    return { id, hearingId }
  }

  it('announced continuation carries notice forward', async () => {
    const { hearingId } = await noticedHearing()
    const next = await continueHearing(
      handle.db,
      world.staff,
      {
        hearingId,
        toMeetingId: await meetingIdOn('2027-04-29', 'zba'),
        announcedAtMeeting: true,
        announcedDetails: 'Continued to April 29 at 7:00 PM in the Town Hall meeting room.',
      },
      signal,
    )
    expect(next.ok).toBe(true)
    if (!next.ok) return
    const fresh = await hearingRow(next.value.hearingId)
    const prior = await hearingRow(hearingId)
    expect(prior.status).toBe('continued')
    expect(fresh).toMatchObject({
      continuedFrom: hearingId,
      continuationAnnounced: true,
      status: 'scheduled',
    })
    expect(fresh.properlyNoticedAt).not.toBeNull()
    expect((await noticeStatus(handle.db, fresh.noticeSetId, signal)).properlyNoticed).toBe(true)
    expect(
      await handle.db.select().from(noticeItems).where(eq(noticeItems.setId, fresh.noticeSetId)),
    ).toEqual([])
  })

  it('announced continuation without details is details_required', async () => {
    const { hearingId } = await noticedHearing()
    const next = await continueHearing(
      handle.db,
      world.staff,
      {
        hearingId,
        toMeetingId: await meetingIdOn('2027-04-29', 'zba'),
        announcedAtMeeting: true,
        announcedDetails: '  ',
      },
      signal,
    )
    expect(next).toEqual({ ok: false, error: 'details_required' })
    expect((await hearingRow(hearingId)).status).toBe('scheduled')
  })

  it('unannounced continuation requires fresh notice', async () => {
    const { hearingId } = await noticedHearing()
    const next = await continueHearing(
      handle.db,
      world.staff,
      { hearingId, toMeetingId: await meetingIdOn('2027-04-29', 'zba'), announcedAtMeeting: false },
      signal,
    )
    expect(next.ok).toBe(true)
    if (!next.ok) return
    const fresh = await hearingRow(next.value.hearingId)
    expect(fresh.properlyNoticedAt).toBeNull()
    const status = await noticeStatus(handle.db, fresh.noticeSetId, signal)
    expect(status.properlyNoticed).toBe(false)
    const mail = status.items.filter((i) => i.channel === 'verified_mail')
    expect(mail.length).toBe(2)
    expect(mail.every((i) => i.dueOn === '2027-04-24')).toBe(true)
  })

  it('an unannounced planning board continuation to 2027-04-28 has mail due 2027-04-18', async () => {
    const id = await pbApp()
    const hearingId = await schedule(id, '2027-04-14', 'planning_board', 'submission_and_hearing')
    const next = await continueHearing(
      handle.db,
      world.staff,
      {
        hearingId,
        toMeetingId: await meetingIdOn('2027-04-28', 'planning_board'),
        announcedAtMeeting: false,
      },
      signal,
    )
    expect(next.ok).toBe(true)
    if (!next.ok) return
    const fresh = await hearingRow(next.value.hearingId)
    const status = await noticeStatus(handle.db, fresh.noticeSetId, signal)
    expect(
      status.items
        .filter((i) => i.channel === 'verified_mail')
        .every((i) => i.dueOn === '2027-04-18'),
    ).toBe(true)
  })

  it('a reviewer continuing a hearing is forbidden', async () => {
    const { hearingId } = await noticedHearing()
    const next = await continueHearing(
      handle.db,
      world.reviewer,
      { hearingId, toMeetingId: await meetingIdOn('2027-04-29', 'zba'), announcedAtMeeting: false },
      signal,
    )
    expect(next).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('renderNoticeLetters', () => {
  async function templatedZba() {
    await saveAndPublish(handle.db, world.admin, 'template', 'hearing-notice', {
      key: 'hearing-notice',
      label: 'Hearing notice',
      kind: 'hearing_notice',
      body: '{{board.name}} will hold a {{hearing.kind}} on {{meeting.date}} at {{meeting.time}}, {{meeting.location}}.\n\nDear {{notice.recipientName}}: application {{application.number}} at {{parcel.siteAddress}}.',
    })
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      world.zbaTypeKey,
      boardTypeBody('nh.zba_variance', world.zbaTypeKey, 'VAR', {
        templateKeys: ['hearing-notice'],
      }),
    )
    return await zbaApp({ recipients: 3 })
  }

  it('notice letters render one page per mail recipient', async () => {
    const id = await templatedZba()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    const row = await hearingRow(hearingId)
    const pdf = await renderNoticeLetters(handle.db, world.staff, row.noticeSetId, signal)
    expect(pdf.ok).toBe(true)
    if (!pdf.ok) return
    expect((await PDFDocument.load(pdf.value)).getPageCount()).toBe(3)
  })

  it('without a hearing notice template the result is no_template', async () => {
    const id = await zbaApp()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    const row = await hearingRow(hearingId)
    expect(await renderNoticeLetters(handle.db, world.staff, row.noticeSetId, signal)).toEqual({
      ok: false,
      error: 'no_template',
    })
  })

  it('a reviewer rendering letters is forbidden', async () => {
    const id = await templatedZba()
    const hearingId = await schedule(id, '2027-04-15', 'zba')
    const row = await hearingRow(hearingId)
    expect(await renderNoticeLetters(handle.db, world.reviewer, row.noticeSetId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('an unknown set is not_found', async () => {
    expect(await renderNoticeLetters(handle.db, world.staff, randomUUID(), signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('hearing notice template with an unknown merge field fails publish', async () => {
    const saved = await saveDraft(
      handle.db,
      world.admin,
      {
        kind: 'template',
        key: 'bad-notice',
        body: {
          key: 'bad-notice',
          label: 'Bad',
          kind: 'hearing_notice',
          body: 'Hello {{notice.nickname}}',
        },
      },
      signal,
    )
    if (!saved.ok) throw new Error('save failed')
    const published = await publishConfig(handle.db, world.admin, saved.value.versionId, signal)
    expect(published).toEqual({ ok: false, error: { unknownMergeFields: ['notice.nickname'] } })
  })
})
