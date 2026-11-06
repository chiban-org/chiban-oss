import { E2E_BASE_URL, expect, linkIn, test, uniqueEmail, waitForEmail } from '../fixtures/test'
import { confirmWith } from './confirm'
import {
  buildAndPublishAgenda,
  meetingWithHearing,
  type PublishedMeeting,
  savePacket,
  sharePacketDocument,
} from './packetSetup'
import { expectRefused } from './refusal'

const MEMBER = 'pb.member@alderpond.example'
const OUTSIDE_SUMMARY = 'Also send to someone outside the board'

test.describe
  .serial('sending the packet and keeping its links', () => {
    test.use({ role: 'staff' })
    let meeting: PublishedMeeting
    let outsider: string
    let outsideLink: string
    let packetTitle: string

    test('prepares a published agenda and a saved packet', async ({ page, db, suffix }) => {
      outsider = uniqueEmail('outside', suffix)
      meeting = await meetingWithHearing(page, db, {
        application: 'Merganser Court minor site plan',
        daysAhead: 650,
        location: `Delivery chain room ${suffix}`,
      })
      await buildAndPublishAgenda(page, meeting.meetingId)
      await sharePacketDocument(page, meeting.meetingId)
      await savePacket(page, meeting.meetingId, 'Application MSP-2026-0002, snapshot 1')
      const row = await db.one<{ title: string }>(
        'select title from board_packets where meeting_id = $1',
        [meeting.meetingId],
      )
      packetTitle = row.title
    })

    test('sends the packet to the seated board members by email', async ({ page, db }) => {
      const since = new Date()
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      await page.getByRole('button', { name: /^Send to the .* \(5 members\)$/ }).click()
      const mail = await waitForEmail({ to: MEMBER, since, subject: packetTitle })
      expect(linkIn(mail, `${E2E_BASE_URL}/board`)).toBe(`${E2E_BASE_URL}/board`)
      const sent = await db.one<{ sent_at: string | null }>(
        'select sent_at from board_packets where meeting_id = $1',
        [meeting.meetingId],
      )
      expect(sent.sent_at).not.toBeNull()
    })

    test('refuses an outside link to a seated member beside the email field', async ({ page }) => {
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      await page.getByText(OUTSIDE_SUMMARY, { exact: true }).click()
      await page.getByLabel(/^Name/).fill('Robin Vale')
      await page.getByLabel(/^Email/).fill(MEMBER)
      await page.getByRole('button', { name: 'Send the link' }).click()
      await expectRefused(
        page.getByLabel(/^Email/),
        'This person is a seated member of the board. Send the packet to the board instead.',
      )
    })

    test('sends a private link outside the board that opens without signing in', async ({
      page,
      browser,
    }) => {
      const since = new Date()
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      await page.getByText(OUTSIDE_SUMMARY, { exact: true }).click()
      await page.getByLabel(/^Name/).fill('Ola Outsider')
      await page.getByLabel(/^Email/).fill(outsider)
      await page.getByRole('button', { name: 'Send the link' }).click()
      const mail = await waitForEmail({ to: outsider, since })
      outsideLink = linkIn(mail, `${E2E_BASE_URL}/board/packets/`)
      const context = await browser.newContext()
      const reader = await context.newPage()
      await reader.goto(outsideLink)
      await expect(reader.getByRole('heading', { level: 1 })).toHaveText(packetTitle)
      await context.close()
    })

    test('resends the link to the outside recipient', async ({ page }) => {
      const since = new Date()
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      const row = page.getByRole('listitem').filter({ hasText: outsider })
      await row.getByRole('button', { name: 'Resend' }).click()
      await waitForEmail({ to: outsider, since })
    })

    test('sends an update after the agenda changes', async ({ page }) => {
      const since = new Date()
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      await page.getByRole('button', { name: 'Reopen the agenda' }).click()
      await confirmWith(page, 'Reopen the published agenda?', 'Reopen the agenda')
      await page.getByText('Add an item', { exact: true }).click()
      await page
        .getByLabel(/^Title/)
        .first()
        .fill('Other business')
      await page.getByRole('button', { name: 'Add item' }).click()
      await expect(page.getByText('Other business')).toBeVisible()
      await page.getByRole('button', { name: 'Publish the agenda' }).click()
      await expect(page.getByText(/Revision 2\./)).toBeVisible()
      await page.getByRole('button', { name: 'Replace the agenda' }).click()
      await page.getByRole('button', { name: 'Send update' }).click()
      await waitForEmail({ to: MEMBER, since, subject: 'Board packet updated' })
    })

    test('turns off the outside link after the confirmation and the link stops working', async ({
      page,
      browser,
      db,
    }) => {
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      const turnOff = page
        .getByRole('listitem')
        .filter({ hasText: outsider })
        .getByRole('button', { name: 'Turn off link' })
      while ((await turnOff.count()) > 0) {
        const before = await turnOff.count()
        await turnOff.first().click()
        await confirmWith(page, /^Turn off the packet link for /, 'Turn off the link')
        await expect(turnOff).toHaveCount(before - 1)
      }
      const context = await browser.newContext()
      const reader = await context.newPage()
      await reader.goto(outsideLink)
      await expect(reader.getByRole('heading', { level: 1, name: packetTitle })).toHaveCount(0)
      await context.close()
      const links = await db.rows(
        'select 1 from board_packet_links l join board_packets p on p.id = l.packet_id where p.meeting_id = $1 and l.revoked_at is not null',
        [meeting.meetingId],
      )
      expect(links.length).toBeGreaterThan(0)
    })
  })
