import { type E2eDb, expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { expectToast } from './requestSupport'

async function townYear(db: E2eDb): Promise<number> {
  const row = await db.one<{ year: number }>(
    'select extract(year from (now() at time zone time_zone))::int as year from town_settings',
  )
  return row.year
}

test.describe('Census report as the clerk', () => {
  test.use({ role: 'staff' })

  test('falls back to the town year when the year is 0', async ({ page, db }) => {
    await page.goto('/staff/reports/census?year=0')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Census building permits report' }),
    ).toBeVisible()
    await expect(page.getByLabel('Year')).toHaveValue(String(await townYear(db)))
    await expect(
      page.getByRole('heading', { level: 2, name: /^Town of Alder Pond, / }),
    ).toBeVisible()
  })

  test('classifies a permit that needs it, refusing counts that do not fit the kind first', async ({
    page,
    db,
  }) => {
    await page.goto(`/staff/reports/census?year=${await townYear(db)}&month=year`)
    const needs = page.getByRole('region', { name: 'Needs classification' })
    test.skip(
      (await needs.count()) === 0,
      'no issued building permit awaits classification in the period',
    )
    const card = needs.getByRole('listitem').first()
    const units = card.getByLabel('Housing units')
    await card.getByLabel('Kind of structure').selectOption('single_family')
    await card.getByLabel('Buildings').fill('1')
    await units.fill('9')
    await card.getByRole('button', { name: 'Save classification' }).click()
    await expectRefusedBeside(units, 'The housing units do not fit that kind of structure')
    await units.fill('1')
    await card.getByRole('button', { name: 'Save classification' }).click()
    await expectToast(page, 'Classification saved.')
    const rows = await db.rows('select 1 from census_classifications')
    expect(rows.length).toBeGreaterThan(3)
  })
})

test.describe('Census report as the inspector', () => {
  test.use({ role: 'inspector' })

  test('is refused the report', async ({ page }) => {
    await page.goto('/staff/reports/census')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to see the Census report.',
    )
  })
})
