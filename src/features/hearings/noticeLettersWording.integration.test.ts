import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scheduleHearing } from '@/features/hearings/hearings'
import { renderNoticeLetters } from '@/features/hearings/noticeLetters'
import {
  type BoardWorld,
  boardTypeBody,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import { pdfWording } from '@/test/pdfWording'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15', '2027-04-29'] })
})
afterEach(async () => {
  await handle.drop()
})

describe('hearing notice letter wording', () => {
  it('one letter per mail recipient', async () => {
    await saveAndPublish(handle.db, world.admin, 'template', 'hearing-notice', {
      key: 'hearing-notice',
      label: 'Hearing notice',
      kind: 'hearing_notice',
      body: '{{board.name}} will hold a {{hearing.kind}} on {{meeting.date}} at {{meeting.time}}, {{meeting.location}}.\n\nDear {{notice.recipientName}}, {{notice.recipientAddress}}: application {{application.number}} at {{parcel.siteAddress}} for {{party.applicant.name}}.',
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
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await recordNoRegionalImpact(handle.db, world, id)
    await issueListWithRecipients(handle.db, world, id, [recipient(1), recipient(2)])
    const rows = await handle.db.query.boardMeetings.findMany({
      where: (m, { and, eq }) => and(eq(m.meetingDate, '2027-04-15'), eq(m.board, 'zba')),
    })
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: rows[0]?.id ?? '', kind: 'public_hearing' },
      signal,
    )
    if (!scheduled.ok) throw new Error(JSON.stringify(scheduled.error))
    const [hearing] = await handle.db.query.hearings.findMany({
      where: (h, { eq }) => eq(h.id, scheduled.value.hearingId),
    })
    const pdf = await renderNoticeLetters(
      handle.db,
      world.staff,
      hearing?.noticeSetId ?? '',
      signal,
    )
    if (!pdf.ok) throw new Error(pdf.error)
    expect(await pdfWording(pdf.value)).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Hearing notice

      Alder Pond Zoning Board of Adjustment will hold a Public hearing on April 15, 2027 at 7:00 PM, Not
      recorded.

      Dear Recipient 1, 1 Heron Lane, Alder Pond NH 03999: application VAR-2027-0001 at Not recorded for
      Not recorded.

      Page 1 of 1


      Town of Alder Pond

      Hearing notice

      Alder Pond Zoning Board of Adjustment will hold a Public hearing on April 15, 2027 at 7:00 PM, Not
      recorded.

      Dear Recipient 2, 2 Heron Lane, Alder Pond NH 03999: application VAR-2027-0001 at Not recorded for
      Not recorded.

      Page 1 of 1

      "
    `)
  })
})
