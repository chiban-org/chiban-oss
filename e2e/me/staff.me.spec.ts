import { expect, test } from '../fixtures/test'
import { expectMaineDatabase, expectNoNhTerms, signInAs, TOWN } from './support'

const REQUIRED_CODE = 'Maine Uniform Building and Energy Code'
const LESSER_CODE = 'Maine Uniform Building Code'
const FERNHOLLOW_PARCEL = '10 Loon Cove Road'

test.describe('the Fernhollow staff area', () => {
  test('runs on the Maine database', () => {
    expectMaineDatabase()
  })

  test('a clerk signs in and lands on the staff home of the Maine town', async ({ page }) => {
    await signInAs(page, 'staff')
    await expect(page.getByText(TOWN).first()).toBeAttached()
    await expect(page.getByText(FERNHOLLOW_PARCEL).first()).toBeVisible()
  })

  test('a town over 4,000 residents cannot put a code other than MUBEC into use', async ({
    page,
    db,
  }) => {
    await signInAs(page, 'admin')
    await page.goto('/staff/settings/building_program/default')
    await expect(page.getByLabel('The town issues building permits')).toBeChecked()
    await expect(page.getByLabel('Residents')).toHaveValue('5200')
    const code = page.getByLabel('Building code the town enforces')
    await expect(code.locator('option:checked')).toHaveText(REQUIRED_CODE)
    await expectNoNhTerms(page)

    await code.selectOption({ label: LESSER_CODE })
    await page.getByRole('button', { name: 'Put into use', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Put into use now' }).click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: `towns over 4000 residents must enforce ${REQUIRED_CODE}` })
        .first(),
    ).toBeVisible()
    await expectNoNhTerms(page)

    const published = await db.one<{ body: { codeChoice: string; permitsEnabled: boolean } }>(
      "select body from config_versions where kind = 'building_program' and key = 'default' and status = 'published'",
    )
    expect(published.body).toMatchObject({ codeChoice: 'me.code.mubec', permitsEnabled: true })
  })
})
