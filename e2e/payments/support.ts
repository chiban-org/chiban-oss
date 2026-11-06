import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

export { applicationByNumber, expectRefusedBeside } from '../applications/support'
export { confirmDialog, confirmWith } from '../boards/confirm'

export interface LedgerRow {
  entry_type: string
  method: string
  amount_cents: number
  check_number: string | null
  reason: string | null
}

const LEDGER_COLUMNS = 'e.entry_type, e.method, e.amount_cents, e.check_number, e.reason'

export async function ledgerFor(db: E2eDb, payer: string): Promise<LedgerRow[]> {
  return await db.rows<LedgerRow>(
    `select ${LEDGER_COLUMNS} from ledger_entries e where e.payer_name = $1 order by e.posted_at, e.id`,
    [payer],
  )
}

export async function ledgerOfType(db: E2eDb, payer: string, entryType: string) {
  return (await ledgerFor(db, payer)).filter((row) => row.entry_type === entryType)
}

export function ledgerSection(page: Page): Locator {
  return page.getByRole('region', { name: 'Fees and payments' })
}

export function entryItem(page: Page, summary: string | RegExp): Locator {
  return ledgerSection(page).getByRole('listitem').filter({ hasText: summary })
}

export async function openEntryControls(item: Locator): Promise<Locator> {
  const details = item.locator('details')
  if ((await details.getAttribute('open')) === null) {
    await details.locator('summary', { hasText: 'Refund, correct, or reverse' }).click()
  }
  return details
}

export async function openRecordPayment(page: Page): Promise<Locator> {
  const details = ledgerSection(page).locator('details', {
    has: page.locator('summary', { hasText: 'Record a cash or check payment' }),
  })
  if ((await details.getAttribute('open')) === null) {
    await details.locator('summary').click()
  }
  return details
}

export function formWith(scope: Locator, submitLabel: string): Locator {
  return scope
    .locator('form')
    .filter({ has: scope.page().getByRole('button', { name: submitLabel, exact: true }) })
}

export async function expectNoDialog(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

export async function expectConfirmation(page: Page, message: string): Promise<void> {
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: message }).last(),
  ).toBeVisible()
}

export interface DeskPayment {
  method: 'Check' | 'Cash'
  amount: string
  payer: string
  checkNumber?: string
}

export async function recordDeskPayment(page: Page, payment: DeskPayment): Promise<void> {
  const form = formWith(await openRecordPayment(page), 'Record payment')
  await form.getByLabel('Paid by').selectOption({ label: payment.method })
  await form.getByLabel('Amount in dollars').fill(payment.amount)
  if (payment.checkNumber !== undefined) {
    await form.getByLabel('Check number').fill(payment.checkNumber)
  }
  await form.getByLabel('Payer name').fill(payment.payer)
  await form.getByRole('button', { name: 'Record payment' }).click()
  await expect(
    entryItem(
      page,
      new RegExp(`payment by ${payment.method.toLowerCase()}.*from ${payment.payer}`),
    ),
  ).toBeVisible()
}

export async function seededAttemptId(db: E2eDb, permit: string): Promise<string> {
  const row = await db.one<{ id: string }>(
    `select p.id from payment_attempts p, applications a
      where a.number = $1 and p.planned_allocations::text like '%' || a.id::text || '%'`,
    [permit],
  )
  return row.id
}

export async function attemptState(db: E2eDb, attemptId: string) {
  return await db.one<{ state: string; manual_outcome: string | null }>(
    'select state, manual_outcome from payment_attempts where id = $1',
    [attemptId],
  )
}
