import type { Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

export type Board = 'planning_board' | 'zba'

export interface MeetingSpec {
  board: Board
  date: string
  kind: 'regular' | 'special'
  location: string
}

export async function addMeetingThroughForm(page: Page, spec: MeetingSpec): Promise<void> {
  await page.goto('/staff/boards/meetings')
  await page.getByRole('button', { name: 'Add meeting' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a meeting' })
  await dialog.getByLabel('Board').selectOption(spec.board)
  await dialog.getByLabel('Date').fill(spec.date)
  await dialog.getByLabel('Kind').selectOption(spec.kind)
  await dialog.getByLabel('Location').fill(spec.location)
  await dialog.getByRole('button', { name: 'Add meeting' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Meeting added to the calendar.')
}

export async function meetingIdFor(db: E2eDb, spec: MeetingSpec): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select id from board_meetings where board = $1 and meeting_date = $2 and kind = $3 and location = $4',
    [spec.board, spec.date, spec.kind, spec.location],
  )
  return row.id
}
