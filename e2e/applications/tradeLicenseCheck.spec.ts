import { expect, test } from '../fixtures/test'
import { expectConfirmation } from './support'
import { openTrade, unpaidTradeAtCounter } from './tradeSupport'

test.describe('the state license check on a trade permit record', () => {
  test.use({ role: 'staff' })

  test('a failing check blocks issuance with the reason, and an active one clears it', async ({
    page,
    db,
    suffix,
  }) => {
    const trade = await unpaidTradeAtCounter(page, db, suffix)
    await openTrade(page, trade)

    const panel = page.getByRole('region', { name: 'State license check' })
    await expect(panel).toContainText(`The applicant entered license number ${trade.job.license}.`)
    await expect(panel).toContainText(`Active: license ${trade.job.license}`)
    await expect(panel).toContainText(/Checked by .+ on /)
    const lookup = panel.getByRole('link', { name: 'Open the NH license verification search' })
    await expect(lookup).toHaveAttribute(
      'href',
      'https://forms.nh.gov/licenseverification/Search.aspx',
    )
    await expect(lookup).toHaveAttribute('target', '_blank')

    await panel.locator('summary', { hasText: 'Check again' }).click()
    await panel.getByLabel('Result of the state lookup').selectOption({ label: 'Expired' })
    await panel.getByLabel('Note').fill('Lapsed in June')
    await panel.getByRole('button', { name: 'Record the license check' }).click()
    await expectConfirmation(
      page,
      'License check recorded. The permit cannot be issued until a check finds the license active.',
    )
    await expect(panel).toContainText(`Expired: license ${trade.job.license}`)
    const requirement = page
      .getByRole('region', { name: 'Requirements' })
      .getByRole('listitem')
      .filter({ hasText: 'State license checked' })
    await expect(requirement).toContainText(
      `The latest state license check found license ${trade.job.license} expired. Lapsed in June.`,
    )

    await expect(panel.locator('summary', { hasText: 'Check again' })).toHaveCount(0)
    await requirement.locator('summary', { hasText: 'Record the license check' }).click()
    await requirement.getByLabel('Result of the state lookup').selectOption({ label: 'Active' })
    await requirement.getByRole('button', { name: 'Record the license check' }).click()
    await expectConfirmation(page, 'License check recorded. The license is active.')
    await expect(requirement).not.toContainText('expired')
    await expect(panel).toContainText(`Active: license ${trade.job.license}`)
    const checks = await db.rows<{ result: string }>(
      'select result from license_checks where application_id = $1 order by checked_at',
      [trade.applicationId],
    )
    expect(checks.map((c) => c.result)).toEqual(['active', 'expired', 'active'])
  })
})
