import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect, fillDate } from '../fixtures/test'

export { describedText, expectRefusedBeside } from '../applications/support'

const CASE_URL = /\/staff\/enforcement\/([0-9a-f-]{36})$/

export const ZONING_REF = 'Zoning Ordinance Section 6.1, uses allowed in the district'

export function caseIdFrom(page: Page): string {
  const id = CASE_URL.exec(page.url())?.[1]
  if (id === undefined) throw new Error(`not on a case page: ${page.url()}`)
  return id
}

export function region(page: Page, name: string): Locator {
  return page.getByRole('region', { name })
}

export async function openSummary(scope: Locator, text: string): Promise<Locator> {
  const details = scope
    .locator('details')
    .filter({ has: scope.page().locator('summary', { hasText: text }) })
    .first()
  if ((await details.getAttribute('open')) === null) {
    await details.locator('summary', { hasText: text }).click()
  }
  return details
}

export async function startCase(page: Page, location: string): Promise<string> {
  await page.goto('/staff/enforcement')
  await page.getByRole('button', { name: 'Open a case' }).click()
  const dialog = page.getByRole('dialog', { name: 'Open a case' })
  await dialog.getByLabel('Where is the property?').fill(location)
  await dialog.getByRole('button', { name: 'Open case' }).click()
  await page.waitForURL(CASE_URL)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^EC-/)
  return caseIdFrom(page)
}

const MOVE_BUTTONS = new Map([
  ['Under investigation', 'Start the investigation'],
  ['No violation found', 'Record no violation'],
  ['Resolved', 'Resolve the case'],
])

export function doThisNow(page: Page): Locator {
  return region(page, 'Do this now')
}

export async function moreActions(page: Page): Promise<Locator> {
  return await openSummary(page.locator('aside'), 'More actions')
}

export async function formFor(
  page: Page,
  panel: string,
  summary: string | null,
  submit: string,
): Promise<Locator> {
  await page
    .getByRole('main')
    .getByRole('button', { name: submit, exact: true, includeHidden: true })
    .first()
    .waitFor({ state: 'attached' })
  const card = doThisNow(page)
  if ((await card.getByRole('button', { name: submit, exact: true }).count()) > 0) return card
  const scope = region(page, panel)
  return summary === null ? scope : await openSummary(scope, summary)
}

export async function moveCaseTo(page: Page, label: string) {
  const name = MOVE_BUTTONS.get(label) ?? label
  const inCard = doThisNow(page).getByRole('button', { name, exact: true })
  const button =
    (await inCard.count()) > 0
      ? inCard
      : (await moreActions(page)).getByRole('button', { name, exact: true })
  await button.click()
  if (label === 'No violation found') {
    await page
      .getByRole('dialog', { name: /^Record no violation for / })
      .getByRole('button', { name: 'Record no violation' })
      .click()
  }
  await expect(page.getByRole('main').getByText(label, { exact: true }).first()).toBeVisible()
}

export async function recordZoningFinding(page: Page, ref: string, facts: string): Promise<void> {
  const panel = 'Findings and notices of violation'
  const form = await formFor(page, panel, 'Record a finding', 'Record finding')
  await form.getByLabel('Section or condition').fill(ref)
  await form.getByLabel('Facts').fill(facts)
  await form.getByRole('button', { name: 'Record finding' }).click()
  await expect(
    region(page, panel).getByText(`Zoning ordinance: ${ref}`, { exact: true }),
  ).toBeVisible()
}

export async function caseNumber(db: E2eDb, caseId: string): Promise<string> {
  const row = await db.one<{ number: string }>(
    'select number from enforcement_cases where id = $1',
    [caseId],
  )
  return row.number
}

export async function countRows(db: E2eDb, sql: string, params: unknown[]): Promise<number> {
  const row = await db.one<{ count: string }>(sql, params)
  return Number(row.count)
}

export const DEADLINE = '2090-06-01'

export async function caseWithOpenFinding(page: Page, location: string): Promise<string> {
  const caseId = await startCase(page, location)
  await moveCaseTo(page, 'Under investigation')
  await recordZoningFinding(
    page,
    ZONING_REF,
    'A second dwelling is rented in a one dwelling building.',
  )
  return caseId
}

export async function draftOrderFor(page: Page, action: string): Promise<void> {
  const orders = await formFor(page, 'Cease and desist orders', 'Draft an order', 'Draft order')
  await orders.getByRole('checkbox', { name: `Zoning ordinance: ${ZONING_REF}` }).check()
  await orders.getByLabel('Corrective action required').fill(action)
  await fillDate(orders.getByLabel('Corrective action due'), DEADLINE)
  await orders.getByRole('button', { name: 'Draft order' }).click()
  await expectConfirmation(page, 'Order drafted.')
}

export async function issueOrderOnPage(page: Page): Promise<void> {
  const orders = await formFor(page, 'Cease and desist orders', null, 'Issue order')
  await orders.getByRole('button', { name: 'Issue order' }).click()
  await expectConfirmation(page, 'Order issued.')
}

export async function uploadCaseDocument(page: Page, kind: string, title: string): Promise<void> {
  const documents = region(page, 'Documents and photos')
  const upload = await openSummary(documents, 'Upload a document or photo')
  await upload.getByLabel('What kind of document').selectOption({ label: kind })
  await upload.getByLabel('File', { exact: true }).setInputFiles({
    name: 'document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  })
  await upload.getByLabel('Name for this document').fill(title)
  await upload.getByRole('button', { name: 'Upload' }).click()
  await expect(documents.getByText(title).first()).toBeVisible()
}

export async function issuedOrderCase(page: Page, location: string, action: string) {
  const caseId = await caseWithOpenFinding(page, location)
  await draftOrderFor(page, action)
  await issueOrderOnPage(page)
  return caseId
}

export async function caseAt(db: E2eDb, location: string): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select c.id from enforcement_cases c join enforcement_orders o on o.case_id = c.id where c.location_text = $1',
    [location],
  )
  return row.id
}

export async function expectConfirmation(page: Page, message: string): Promise<void> {
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: message }).last(),
  ).toBeVisible()
}

export function named(scope: Locator, name: string): Locator {
  return scope.locator(`[name="${name}"]`)
}
