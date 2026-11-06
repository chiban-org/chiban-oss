import type { Locator } from '@playwright/test'
import { expect, fillDate, test } from '../fixtures/test'
import {
  caseAt,
  countRows,
  expectConfirmation,
  expectRefusedBeside,
  named,
  openSummary,
  region,
  uploadCaseDocument,
} from './support'

const FUTURE = '2099-01-01'
const CEDAR_HILL = '5 Cedar Hill Road'
const APPEALS =
  'select count(*) from enforcement_appeals where case_id = $1 and appellant_name = $2'

test.describe
  .serial('an appeal, its peril certificate, restraining order and decision', () => {
    test.use({ role: 'staff' })
    let caseId = ''
    let appellant = ''

    const appealCard = (appeals: Locator) =>
      appeals.getByRole('article').filter({ hasText: `appealed by ${appellant} on` })

    test('refuses an appeal filed in 2099 beside the date and stores nothing', async ({
      page,
      db,
      suffix,
    }) => {
      caseId = await caseAt(db, CEDAR_HILL)
      appellant = `Appellant ${suffix}`
      await page.goto(`/staff/enforcement/${caseId}`)
      const appeals = region(page, 'Appeals to the zoning board of adjustment')
      const form = await openSummary(appeals, 'Record an appeal')
      await form.getByLabel('Appellant').fill(appellant)
      await fillDate(form.getByLabel('Date filed'), FUTURE)
      await form.getByRole('button', { name: 'Record appeal' }).click()
      await expectRefusedBeside(form.getByLabel('Date filed'), 'The date cannot be in the future.')
      expect(await countRows(db, APPEALS, [caseId, appellant])).toBe(0)
    })

    test('records an appeal of the order and stores it', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const appeals = region(page, 'Appeals to the zoning board of adjustment')
      const form = await openSummary(appeals, 'Record an appeal')
      await form.getByLabel('Appellant').fill(appellant)
      await form.getByRole('button', { name: 'Record appeal' }).click()
      await expectConfirmation(page, 'Appeal recorded.')
      await expect(appealCard(appeals).getByText('Not yet decided.')).toBeVisible()
      expect(await countRows(db, APPEALS, [caseId, appellant])).toBe(1)
    })

    test('refuses a peril certificate dated 2099 beside the date', async ({ page, suffix }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const card = appealCard(region(page, 'Appeals to the zoning board of adjustment'))
      const form = await openSummary(card, 'Certify imminent peril')
      await form.getByLabel('Statement').fill(`Roof is failing, ref ${suffix}`)
      await fillDate(named(form, 'certifiedOn'), FUTURE)
      await form.getByRole('button', { name: 'Certify' }).click()
      await expectRefusedBeside(
        named(form, 'certifiedOn'),
        'Enter the date certified between January 1, 1900 and',
      )
    })

    test('certifies imminent peril as the issuing officer', async ({ page, db, suffix }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const card = appealCard(region(page, 'Appeals to the zoning board of adjustment'))
      const form = await openSummary(card, 'Certify imminent peril')
      await form.getByLabel('What is at risk').selectOption({ label: 'Safety' })
      await form.getByLabel('Statement').fill(`Roof is failing, ref ${suffix}`)
      await form.getByRole('button', { name: 'Certify' }).click()
      await expectConfirmation(page, 'Imminent peril certified.')
      await expect(card.getByText(`(Safety): Roof is failing, ref ${suffix}`)).toBeVisible()
      expect(
        await countRows(db, 'select count(*) from peril_certifications where statement = $1', [
          `Roof is failing, ref ${suffix}`,
        ]),
      ).toBe(1)
    })

    test('refuses a restraining order with no court document beside the field', async ({
      page,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const card = appealCard(region(page, 'Appeals to the zoning board of adjustment'))
      const form = await openSummary(card, 'Record a restraining order')
      await form.getByRole('button', { name: 'Record restraining order' }).click()
      await expectRefusedBeside(
        form.getByLabel('Court document'),
        'Choose the court document. Upload it in the Documents section first, as a court document.',
      )
    })

    test('records a restraining order with an uploaded court document', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      await uploadCaseDocument(page, 'Court document', `ZBA restraint ${suffix}`)
      const card = appealCard(region(page, 'Appeals to the zoning board of adjustment'))
      const form = await openSummary(card, 'Record a restraining order')
      await form.getByLabel('Court document').selectOption({ label: `ZBA restraint ${suffix}` })
      await form.getByRole('button', { name: 'Record restraining order' }).click()
      await expectConfirmation(page, 'Restraining order recorded.')
      await expect(card.getByText(/^Restraining order from the ZBA, issued /)).toBeVisible()
      expect(
        await countRows(
          db,
          'select count(*) from restraining_orders r join enforcement_appeals a on a.id = r.appeal_id where a.case_id = $1 and a.appellant_name = $2',
          [caseId, appellant],
        ),
      ).toBe(1)
    })

    test('keeps the dialog shut for a dissolve date in 2099', async ({ page }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const card = appealCard(region(page, 'Appeals to the zoning board of adjustment'))
      await fillDate(card.getByLabel('Date dissolved'), FUTURE)
      await card.getByRole('button', { name: 'Mark dissolved' }).click()
      await expectRefusedBeside(
        card.getByLabel('Date dissolved'),
        'Enter the date dissolved between January 1, 1900 and',
      )
      const dialog = page.getByRole('dialog', { name: 'Mark this restraining order dissolved?' })
      await expect(dialog).toHaveCount(0)
    })

    test('dissolves the restraining order after confirming', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const card = appealCard(region(page, 'Appeals to the zoning board of adjustment'))
      await card.getByRole('button', { name: 'Mark dissolved' }).click()
      const dialog = page.getByRole('dialog', { name: 'Mark this restraining order dissolved?' })
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toHaveCount(0)
      await card.getByRole('button', { name: 'Mark dissolved' }).click()
      await dialog.getByRole('button', { name: 'Mark dissolved' }).click()
      await expectConfirmation(page, 'Restraining order marked dissolved.')
      await expect(card.getByText(/, dissolved /)).toBeVisible()
      expect(
        await countRows(
          db,
          'select count(*) from restraining_orders r join enforcement_appeals a on a.id = r.appeal_id where a.case_id = $1 and a.appellant_name = $2 and r.dissolved_on is not null',
          [caseId, appellant],
        ),
      ).toBe(1)
    })

    test('refuses a decision dated before the appeal was filed beside the date', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const card = appealCard(region(page, 'Appeals to the zoning board of adjustment'))
      await fillDate(card.getByLabel('Date decided'), '2000-01-01')
      await card.getByRole('button', { name: 'Record decision' }).click()
      await expectRefusedBeside(
        card.getByLabel('Date decided'),
        'The decision cannot be dated before the appeal was filed.',
      )
      expect(
        await countRows(
          db,
          'select count(*) from enforcement_appeals where case_id = $1 and appellant_name = $2 and resolved_on is not null',
          [caseId, appellant],
        ),
      ).toBe(0)
    })

    test('records the decision on the appeal', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const card = appealCard(region(page, 'Appeals to the zoning board of adjustment'))
      await card.getByLabel('Decision').selectOption({ label: 'Upheld' })
      await card.getByRole('button', { name: 'Record decision' }).click()
      await expectConfirmation(page, 'Appeal resolved.')
      await expect(card.getByText(/Upheld on /)).toBeVisible()
      expect(
        await countRows(
          db,
          'select count(*) from enforcement_appeals where case_id = $1 and appellant_name = $2 and outcome = $3',
          [caseId, appellant, 'upheld'],
        ),
      ).toBe(1)
    })
  })
