import { expectRefusedBeside } from '../applications/support'
import { expect, test } from '../fixtures/test'

test.describe('reporting a possible violation with contact details', () => {
  test('refuses a description of only spaces beside the field and saves nothing', async ({
    page,
    db,
    suffix,
  }) => {
    await page.goto('/complaints/new')
    await page.getByLabel(/^Where is the property/).fill(`Blank report lot ${suffix}`)
    await page.getByLabel(/^What did you see/).fill('     ')
    await page.getByRole('button', { name: 'Send report' }).click()
    await expectRefusedBeside(page.getByLabel(/^What did you see/), 'Enter what you saw.')
    const rows = await db.rows<{ id: string }>(
      'select id from complaints where location_text = $1',
      [`Blank report lot ${suffix}`],
    )
    expect(rows).toHaveLength(0)
  })

  test('records the report and shows its reference on the report received page', async ({
    page,
    db,
    suffix,
  }) => {
    const location = `Roadside lot ${suffix}`
    await page.goto('/complaints/new')
    await page.getByLabel(/^Where is the property/).fill(location)
    await page.getByLabel(/^What did you see/).fill(`Unpermitted shed ${suffix}`)
    await page.getByLabel('Your name (optional)').fill(`Reporter ${suffix}`)
    await page.getByRole('button', { name: 'Send report' }).click()

    await expect(page).toHaveURL(/\/complaints\/received\?ref=CP-\d{4}-\d{4,}&reply=none$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Report received' })).toBeVisible()
    const row = await db.one<{ number: string; channel: string; description: string }>(
      'select number, channel, description_original as description from complaints where location_text = $1',
      [location],
    )
    expect(row.channel).toBe('public_named')
    expect(row.description).toBe(`Unpermitted shed ${suffix}`)
    await expect(page.getByText(row.number, { exact: true })).toBeVisible()
    await expect(
      page.getByText('You left no email or phone, so town staff cannot reply to you.'),
    ).toBeVisible()
  })
})
