import { expect, test } from '../fixtures/test'

test.describe('the board role', () => {
  test.use({ role: 'board' })

  test('opens a zoning board packet and sees no staff forms', async ({ page, db }) => {
    const packet = await db.one<{ meeting_id: string; title: string }>(
      `select p.meeting_id, p.title from board_packets p join board_meetings m on m.id = p.meeting_id
       join boards b on b.id = m.board_id
       where b.kind = 'zba' and m.status = 'scheduled' order by m.meeting_date limit 1`,
    )
    await page.goto(`/board/meetings/${packet.meeting_id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(packet.title)
    await expect(page.locator('main form')).toHaveCount(0)
  })

  test('is sent to the board page from the staff meeting calendar', async ({ page }) => {
    await page.goto('/staff/boards/meetings')
    await expect(page).toHaveURL(/\/board$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Board meetings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add meeting' })).toHaveCount(0)
  })
})
