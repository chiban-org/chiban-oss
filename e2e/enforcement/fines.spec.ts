import { expect, fillDate, test } from '../fixtures/test'
import {
  caseAt,
  countRows,
  expectConfirmation,
  expectRefusedBeside,
  named,
  openSummary,
  region,
} from './support'

const OSPREY = '17 Osprey Landing'
const FUTURE = '2099-01-01'
const COURT = 'District Court, Alder Pond Division'
const REFERRALS = 'select count(*) from counsel_referrals where case_id = $1 and counsel_name = $2'

test.describe
  .serial('fines, payments, counsel referral and outcome', () => {
    test.use({ role: 'admin' })
    let caseId = ''
    let docket = ''
    let counsel = ''

    test('refuses a fine dated 2099 beside the date and records a valid one', async ({
      page,
      db,
      suffix,
    }) => {
      caseId = await caseAt(db, OSPREY)
      docket = `2026-CV-${suffix}`
      await page.goto(`/staff/enforcement/${caseId}`)
      const fines = region(page, 'Fines')
      const form = await openSummary(fines, 'Record a court-imposed fine')
      await form.getByLabel('Amount in dollars').fill('50.00')
      await named(form, 'court').fill(COURT)
      await form.getByLabel('Docket number').fill(docket)
      await fillDate(form.getByLabel('Date imposed'), FUTURE)
      await form.getByRole('button', { name: 'Record fine' }).click()
      await expectRefusedBeside(
        form.getByLabel('Date imposed'),
        'Enter the date imposed between January 1, 1900 and',
      )
      const fineCount = 'select count(*) from enforcement_fines where case_id = $1 and docket = $2'
      expect(await countRows(db, fineCount, [caseId, docket])).toBe(0)
    })

    test('records the fine against the judgment', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const fines = region(page, 'Fines')
      const form = await openSummary(fines, 'Record a court-imposed fine')
      await form.getByLabel('Amount in dollars').fill('50.00')
      await named(form, 'court').fill(COURT)
      await form.getByLabel('Docket number').fill(docket)
      await form.getByRole('button', { name: 'Record fine' }).click()
      await expectConfirmation(page, 'Fine recorded.')
      await expect(
        fines.getByText(`Civil penalty, $50.00, imposed`, { exact: false }).first(),
      ).toBeVisible()
      const row = await db.one<{ amount_cents: number }>(
        'select amount_cents from enforcement_fines where case_id = $1 and docket = $2',
        [caseId, docket],
      )
      expect(row.amount_cents).toBe(5000)
    })

    test('refuses a check payment with no check number beside the field', async ({
      pageAs,
      db,
    }) => {
      const finance = await pageAs('finance')
      await finance.goto(`/staff/enforcement/${caseId}`)
      const card = region(finance, 'Fines').getByRole('article').filter({ hasText: docket })
      await card.getByLabel('Amount in dollars').fill('10.00')
      await card.getByLabel('Paid by').selectOption({ label: 'Check' })
      await card.getByLabel('Payer name').fill('Sam Shorefront')
      await card.getByRole('button', { name: 'Record payment' }).click()
      await expectRefusedBeside(card.getByLabel('Check number'), 'Enter the check number.')
      expect(
        await countRows(
          db,
          'select count(*) from ledger_allocations a join enforcement_fines f on f.id = a.fine_id where f.docket = $1',
          [docket],
        ),
      ).toBe(0)
    })

    test('takes a cash payment as finance and lowers the balance', async ({ pageAs, db }) => {
      const finance = await pageAs('finance')
      await finance.goto(`/staff/enforcement/${caseId}`)
      const card = region(finance, 'Fines').getByRole('article').filter({ hasText: docket })
      await card.getByLabel('Amount in dollars').fill('10.00')
      await card.getByLabel('Payer name').fill('Sam Shorefront')
      await card.getByRole('button', { name: 'Record payment' }).click()
      await expectConfirmation(finance, 'Payment recorded.')
      await expect(card.getByText('Paid $10.00. Balance due $40.00.')).toBeVisible()
      const row = await db.one<{ amount_cents: number }>(
        'select a.amount_cents from ledger_allocations a join enforcement_fines f on f.id = a.fine_id where f.docket = $1',
        [docket],
      )
      expect(row.amount_cents).toBe(1000)
    })

    test('refuses a referral dated 2099 beside the date and stores nothing', async ({
      page,
      db,
      suffix,
    }) => {
      counsel = `Attorney Finch ${suffix}`
      await page.goto(`/staff/enforcement/${caseId}`)
      const section = region(page, 'Town counsel')
      const form = await openSummary(section, 'Refer to counsel')
      await named(form, 'counselName').fill(counsel)
      await fillDate(form.getByLabel('Date referred'), FUTURE)
      await form.getByRole('button', { name: 'Refer to counsel' }).click()
      await expectRefusedBeside(
        form.getByLabel('Date referred'),
        'Enter the date referred between January 1, 1900 and',
      )
      expect(await countRows(db, REFERRALS, [caseId, counsel])).toBe(0)
    })

    test('refers the case to counsel and stores the packet', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const section = region(page, 'Town counsel')
      const form = await openSummary(section, 'Refer to counsel')
      await named(form, 'counselName').fill(counsel)
      await form.getByLabel('Purpose').selectOption({ label: 'Penalty action' })
      await form.getByRole('button', { name: 'Refer to counsel' }).click()
      await expectConfirmation(page, 'Referred to counsel. The packet is on the case.')
      const card = section.getByRole('article').filter({ hasText: counsel })
      await expect(card.getByRole('link', { name: 'Open packet' })).toBeVisible()
      const row = await db.one<{ purpose: string; packet_document_id: string | null }>(
        'select purpose, packet_document_id from counsel_referrals where case_id = $1 and counsel_name = $2',
        [caseId, counsel],
      )
      expect(row.purpose).toBe('penalty_action')
      expect(row.packet_document_id).not.toBeNull()
    })

    test('refuses an outcome dated 2099 beside the date, then records a hearing', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const card = region(page, 'Town counsel').getByRole('article').filter({ hasText: counsel })
      const form = await openSummary(card, 'Record an outcome')
      await form.getByLabel('What happened').selectOption({ label: 'Hearing held' })
      await fillDate(named(form, 'occurredOn'), FUTURE)
      await form.getByRole('button', { name: 'Record outcome' }).click()
      await expectRefusedBeside(
        named(form, 'occurredOn'),
        'Enter the date between January 1, 1900 and',
      )
      const outcomes =
        'select count(*) from counsel_outcomes o join counsel_referrals r on r.id = o.referral_id where r.case_id = $1 and r.counsel_name = $2'
      expect(await countRows(db, outcomes, [caseId, counsel])).toBe(0)

      await page.goto(`/staff/enforcement/${caseId}`)
      const fresh = region(page, 'Town counsel').getByRole('article').filter({ hasText: counsel })
      const again = await openSummary(fresh, 'Record an outcome')
      await again.getByLabel('What happened').selectOption({ label: 'Hearing held' })
      await named(again, 'court').fill(COURT)
      await again.getByRole('button', { name: 'Record outcome' }).click()
      await expectConfirmation(page, 'Outcome recorded.')
      await expect(fresh.getByText(`: Hearing held, ${COURT}`)).toBeVisible()
      expect(await countRows(db, outcomes, [caseId, counsel])).toBe(1)
    })
  })
