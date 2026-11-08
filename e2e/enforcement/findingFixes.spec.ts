import { expect, test } from '../fixtures/test'
import { formFor, moveCaseTo, region, startCase } from './support'

const FINDINGS = 'Findings and notices of violation'
const SETBACKS = 'Zoning Ordinance Section 4.2, accessory structure setbacks'

async function findingForm(page: Parameters<typeof formFor>[0]) {
  return await formFor(page, FINDINGS, 'Record a finding', 'Record finding')
}

test.describe('choosing a section and fixing a mistaken finding', () => {
  test.use({ role: 'staff' })

  test('records a finding by tapping a common section chip', async ({ page, db, suffix }) => {
    const caseId = await startCase(page, `41 Finch Hollow ${suffix}`)
    await moveCaseTo(page, 'Under investigation')
    const form = await findingForm(page)
    await form
      .getByRole('group', { name: 'Common sections' })
      .getByRole('button', { name: new RegExp(SETBACKS) })
      .click()
    await expect(form.getByRole('combobox', { name: /Section or condition/ })).toHaveValue(SETBACKS)
    await form.getByLabel('Facts').fill('A shed stands two feet from the side lot line.')
    await form.getByRole('button', { name: 'Record finding' }).click()
    await expect(
      region(page, FINDINGS).getByText(`Zoning ordinance: ${SETBACKS}`, { exact: true }),
    ).toBeVisible()
    const row = await db.one<{ provision_ref: string }>(
      'select provision_ref from violation_findings where case_id = $1',
      [caseId],
    )
    expect(row.provision_ref).toBe(SETBACKS)
  })

  test('records a finding found by searching setback', async ({ page, db, suffix }) => {
    const caseId = await startCase(page, `42 Finch Hollow ${suffix}`)
    await moveCaseTo(page, 'Under investigation')
    const form = await findingForm(page)
    const field = form.getByRole('combobox', { name: /Section or condition/ })
    await field.fill('setback')
    const option = page.getByRole('listbox', { name: 'Matching sections' }).getByRole('option')
    await expect(option.first()).toContainText(SETBACKS)
    await field.press('ArrowDown')
    await field.press('Enter')
    await expect(field).toHaveValue(SETBACKS)
    await form.getByLabel('Facts').fill('A garage sits inside the rear setback.')
    await form.getByRole('button', { name: 'Record finding' }).click()
    await expect(
      region(page, FINDINGS).getByText(`Zoning ordinance: ${SETBACKS}`, { exact: true }),
    ).toBeVisible()
    const row = await db.one<{ provision_ref: string }>(
      'select provision_ref from violation_findings where case_id = $1',
      [caseId],
    )
    expect(row.provision_ref).toBe(SETBACKS)
  })

  test('withdraws a mistaken finding and returns the case to investigation', async ({
    page,
    db,
    suffix,
  }) => {
    const caseId = await startCase(page, `43 Finch Hollow ${suffix}`)
    await moveCaseTo(page, 'Under investigation')
    const form = await findingForm(page)
    await form.getByRole('combobox', { name: /Section or condition/ }).fill('Section 9.9 wrong lot')
    await form.getByLabel('Facts').fill('Recorded against the wrong lot.')
    await form.getByRole('button', { name: 'Record finding' }).click()
    const title = 'Zoning ordinance: Section 9.9 wrong lot'
    const panel = region(page, FINDINGS)
    const item = panel.getByRole('listitem').filter({ hasText: title })
    await item.getByLabel(`More actions for ${title}`).click()
    await item.getByRole('button', { name: `Withdraw ${title}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Withdraw the finding' })
    await dialog.getByLabel('Why it is withdrawn').fill('Recorded on the wrong lot.')
    await dialog.getByRole('button', { name: 'Withdraw finding' }).click()
    await page
      .getByRole('dialog', { name: 'Withdraw this finding?' })
      .getByRole('button', { name: 'Withdraw finding' })
      .click()
    await expect(item.getByText('Withdrawn', { exact: true })).toBeVisible()
    await expect(
      item.getByText(/Withdrawn by Sam Clerk: Recorded on the wrong lot\./),
    ).toBeVisible()
    const finding = await db.one<{ status: string; withdrawn_reason: string }>(
      'select status, withdrawn_reason from violation_findings where case_id = $1',
      [caseId],
    )
    expect(finding).toEqual({ status: 'withdrawn', withdrawn_reason: 'Recorded on the wrong lot.' })
    const caseRow = await db.one<{ status: string }>(
      'select status from enforcement_cases where id = $1',
      [caseId],
    )
    expect(caseRow.status).toBe('investigating')
  })
})
