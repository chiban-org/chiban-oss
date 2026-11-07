import type { Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

export type Board = 'planning_board' | 'zba'

export const BOARD_OPTION_LABELS: Record<Board, string> = {
  planning_board: 'Alder Pond Planning Board',
  zba: 'Alder Pond Zoning Board of Adjustment',
}

export async function boardIdFor(db: E2eDb, board: Board): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select id from boards where kind = $1 and archived_at is null',
    [board],
  )
  return row.id
}

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
  await dialog.getByLabel('Board').selectOption({ label: BOARD_OPTION_LABELS[spec.board] })
  await dialog.getByLabel('Date').fill(spec.date)
  await dialog.getByLabel('Kind').selectOption(spec.kind)
  await dialog.getByLabel('Location').fill(spec.location)
  await dialog.getByRole('button', { name: 'Add meeting' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Meeting added to the calendar.')
}

export async function meetingIdFor(db: E2eDb, spec: MeetingSpec): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select id from board_meetings where board_id = $1 and meeting_date = $2 and kind = $3 and location = $4',
    [await boardIdFor(db, spec.board), spec.date, spec.kind, spec.location],
  )
  return row.id
}
