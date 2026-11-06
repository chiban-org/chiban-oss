import type { Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { applicationIdFor, daysFromToday } from './records'

export interface PublishedMeeting {
  spec: MeetingSpec
  meetingId: string
  applicationId: string
}

export async function meetingWithHearing(
  page: Page,
  db: E2eDb,
  input: { application: string; daysAhead: number; location: string },
): Promise<PublishedMeeting> {
  const spec: MeetingSpec = {
    board: 'planning_board',
    date: await daysFromToday(db, input.daysAhead),
    kind: 'special',
    location: input.location,
  }
  await addMeetingThroughForm(page, spec)
  const meetingId = await meetingIdFor(db, spec)
  const applicationId = await applicationIdFor(db, input.application)
  await page.goto(`/staff/applications/${applicationId}`)
  const panel = page.getByRole('region', { name: 'Hearings and decisions' })
  await panel.getByText('Schedule a hearing', { exact: true }).click()
  await panel.getByLabel('Meeting').selectOption(meetingId)
  await panel.getByRole('button', { name: 'Schedule hearing' }).click()
  await expect(panel.getByText('Hearing scheduled. The notice checklist is ready.')).toBeVisible()
  return { spec, meetingId, applicationId }
}

export async function buildAndPublishAgenda(page: Page, meetingId: string): Promise<void> {
  await page.goto(`/staff/boards/meetings/${meetingId}`)
  await page.getByRole('button', { name: 'Add the scheduled hearings' }).click()
  await expect(page.getByRole('region', { name: 'Agenda' }).getByRole('listitem')).toHaveCount(1)
  await page.getByRole('button', { name: 'Publish the agenda' }).click()
  await expect(page.getByText(/^Published on the public site on /)).toBeVisible()
}

export async function sharePacketDocument(page: Page, meetingId: string): Promise<void> {
  await page.goto(`/staff/boards/meetings/${meetingId}`)
  await page.getByRole('button', { name: 'Share with the board' }).click()
  await expect(
    page.getByText('Shared with the board. Check it to add it to the packet.'),
  ).toBeVisible()
}

export async function savePacket(page: Page, meetingId: string, document: string): Promise<void> {
  await page.goto(`/staff/boards/meetings/${meetingId}`)
  await page.getByLabel(document, { exact: true }).check()
  await page.getByRole('button', { name: 'Save the packet' }).click()
  await expect(page.getByText('Packet saved.')).toBeVisible()
}
