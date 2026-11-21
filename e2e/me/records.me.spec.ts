import { expect, test } from '../fixtures/test'
import { expectNoNhTerms, signInAs, TOWN } from './support'

test('the records custodian sees the acknowledged FOAA request', async ({ page }) => {
  await signInAs(page, 'records')
  await page.goto('/staff/records/requests')
  await expect(page.getByRole('heading', { name: 'FOAA requests' })).toBeVisible()
  await expectNoNhTerms(page)

  await page.getByRole('link', { name: /^RK-/ }).first().click()
  await expect(page).toHaveURL(/\/staff\/records\/requests\/[0-9a-f-]{36}$/)
  await expect(page.getByText('FOAA request', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('definition').filter({ hasText: /^Receipt acknowledged, \w+ \d{1,2}, \d{4}$/ }),
  ).toBeVisible()
  await expectNoNhTerms(page)
})

test('the public home offers a FOAA request', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(TOWN).first()).toBeVisible()
  await expect(
    page.getByText('Make a FOAA request for public records the town keeps.'),
  ).toBeVisible()
  await expectNoNhTerms(page)

  await page.getByRole('link', { name: 'Ask for town records' }).click()
  await expect(page).toHaveURL(/\/records\/request$/)
  await expect(page.getByRole('heading', { name: 'Ask for town records' })).toBeVisible()
  await expectNoNhTerms(page)
})
