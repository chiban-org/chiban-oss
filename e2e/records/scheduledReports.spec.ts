import { confirmWith } from '../boards/confirm'
import { expect, test } from '../fixtures/test'
import { expectToast } from './requestSupport'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

test.describe('Reports as the clerk', () => {
  test.use({ role: 'staff' })

  test('downloads permit volume as an Excel workbook', async ({ page }) => {
    await page.goto('/staff/reports')
    const section = page.getByRole('region', { name: 'Permit volume' })
    const link = section.getByRole('link', { name: 'Download Excel' })
    await expect(link).toBeVisible()
    const href = (await link.getAttribute('href')) ?? ''
    expect(href).toMatch(/^\/staff\/reports\/permit-volume\/xlsx\?from=/)
    const response = await page.request.get(href)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe(XLSX)
    expect(response.headers()['content-disposition']).toMatch(/permit-volume-.*\.xlsx"$/)
  })

  test('schedules a report, pauses it and deletes it', async ({ page, db }) => {
    await page.goto('/staff/reports/schedules')
    await expect(page.getByRole('heading', { level: 1, name: 'Scheduled reports' })).toBeVisible()
    await page.getByRole('button', { name: 'Schedule a report' }).click()
    const dialog = page.getByRole('dialog', { name: 'Schedule a report' })
    await dialog.getByLabel('Report').selectOption('processing-time')
    await dialog.getByLabel('How often').selectOption('quarterly')
    await dialog.getByRole('checkbox', { name: 'Avery Admin' }).check()
    await dialog.getByRole('button', { name: 'Schedule report' }).click()
    await expectToast(page, 'Report scheduled.')
    const row = page.getByRole('row').filter({ hasText: 'Processing time' })
    await expect(row).toContainText('Avery Admin')
    await expect(row).toContainText('Active')
    const stored = await db.one<{ frequency: string; paused: boolean }>(
      `select frequency, paused from report_schedules where report = 'processing-time'`,
    )
    expect(stored).toEqual({ frequency: 'quarterly', paused: false })

    await row.getByRole('button', { name: 'Pause Processing time, quarterly' }).click()
    await expectToast(page, 'Schedule paused.')
    await expect(row.getByText('Paused').first()).toBeVisible()

    await row.getByRole('button', { name: 'Delete Processing time, quarterly' }).click()
    await confirmWith(page, 'Delete Processing time, quarterly?', 'Delete schedule')
    await expectToast(page, 'Schedule deleted.')
    await expect(page.getByRole('row').filter({ hasText: 'Processing time' })).toHaveCount(0)
  })
})
