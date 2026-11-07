import { expect, test } from '../fixtures/test'
import { caseAt, countRows, doThisNow, expectConfirmation, openSummary, region } from './support'

const OSPREY = '17 Osprey Landing'
const PHONE = { width: 390, height: 844 }

test.describe('the field view for an inspector not assigned the case', () => {
  test.use({ role: 'inspector', viewport: PHONE })

  test('leads with the step, then quick actions, and folds the facts at the end', async ({
    page,
    db,
    suffix,
  }) => {
    const caseId = await caseAt(db, OSPREY)
    await page.goto(`/staff/enforcement/${caseId}`)
    await expect(doThisNow(page)).toBeVisible()
    const quick = region(page, 'Quick actions')
    await expect(quick.locator('summary', { hasText: 'Add a photo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Requirements' })).toHaveCount(0)
    await expect(page.locator('summary', { hasText: 'Case facts and more actions' })).toBeVisible()
    const cardTop = (await doThisNow(page).boundingBox())?.y ?? 0
    const quickTop = (await quick.boundingBox())?.y ?? 0
    expect(quickTop).toBeGreaterThan(cardTop)

    const note = await openSummary(quick, 'Add a note')
    await note.getByLabel('Note').fill(`Fence still up, ref ${suffix}`)
    await note.getByRole('button', { name: 'Add note' }).click()
    await expectConfirmation(page, 'Note added.')
    expect(
      await countRows(db, 'select count(*) from enforcement_notes where body = $1', [
        `Fence still up, ref ${suffix}`,
      ]),
    ).toBe(1)
  })
})

test.describe('the case page on a phone', () => {
  test.use({ role: 'staff', viewport: PHONE })

  test('puts a status strip above the work instead of the rail', async ({ page, db }) => {
    await page.goto(`/staff/enforcement/${await caseAt(db, OSPREY)}`)
    const strip = page.getByRole('region', { name: 'Status' })
    await expect(strip).toBeVisible()
    await expect(page.locator('aside')).toBeHidden()
    const facts = await openSummary(strip, 'Facts and more actions')
    await expect(facts.getByText('Assigned to')).toBeVisible()
  })
})

test.describe('the counsel view for an administrator', () => {
  test.use({ role: 'admin' })

  test('shows the summary and the counsel and fine actions, with history folded', async ({
    page,
    db,
  }) => {
    await page.goto(`/staff/enforcement/${await caseAt(db, OSPREY)}`)
    await expect(region(page, 'Case summary')).toBeVisible()
    await expect(page.locator('summary', { hasText: 'Refer to counsel' })).toBeVisible()
    await expect(page.locator('summary', { hasText: 'Record a court-imposed fine' })).toBeVisible()
    await expect(doThisNow(page)).toHaveCount(0)
    const history = page.locator('details[data-history-group]')
    await expect(history).not.toHaveAttribute('open')
  })
})
