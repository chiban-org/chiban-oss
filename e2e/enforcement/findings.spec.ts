import { accountFor, expect, fillDate, test } from '../fixtures/test'
import {
  countRows,
  expectConfirmation,
  expectRefusedBeside,
  formFor,
  moveCaseTo,
  openSummary,
  recordZoningFinding,
  region,
  startCase,
} from './support'

const BEFORE_TODAY = 'between January 1, 1900 and'
const FINDINGS = 'Findings and notices of violation'
const SEND = 'Send a notice of violation'
const FUTURE = '2099-01-01'

test.describe
  .serial('notes, findings and notices on one case', () => {
    test.use({ role: 'staff' })
    let caseId = ''

    test('opens a case and moves it under investigation', async ({ page, db, suffix }) => {
      caseId = await startCase(page, `31 Finch Hollow ${suffix}`)
      await moveCaseTo(page, 'Under investigation')
      const row = await db.one<{ status: string }>(
        'select status from enforcement_cases where id = $1',
        [caseId],
      )
      expect(row.status).toBe('investigating')
    })

    test('refuses a note observed in 2099 beside the date and stores nothing', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const notes = region(page, 'Investigation notes')
      await openSummary(notes, 'Add a note')
      await fillDate(notes.getByLabel('Date observed'), FUTURE)
      await notes.getByLabel('Note').fill(`Future dated note ${suffix}`)
      await notes.getByRole('button', { name: 'Add note' }).click()
      await expectRefusedBeside(
        notes.getByLabel('Date observed'),
        `Enter the date observed ${BEFORE_TODAY}`,
      )
      expect(
        await countRows(db, 'select count(*) from enforcement_notes where case_id = $1', [caseId]),
      ).toBe(0)
    })

    test('adds a note under the clerk name and stores the author', async ({ page, db, suffix }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const notes = region(page, 'Investigation notes')
      const body = `Fence is four feet past the line, ref ${suffix}`
      await openSummary(notes, 'Add a note')
      await notes.getByLabel('Note').fill(body)
      await notes.getByRole('button', { name: 'Add note' }).click()
      await expectConfirmation(page, 'Note added.')
      const item = notes.getByRole('listitem').filter({ hasText: body })
      await expect(item.locator('p').first()).toContainText('Sam Clerk')
      const row = await db.one<{ author_id: string }>(
        'select author_id from enforcement_notes where case_id = $1 and body = $2',
        [caseId, body],
      )
      expect(row.author_id).toBe(await db.userIdFor(accountFor('staff').email))
    })

    test('refuses a finding inspected in 2099 beside the date and stores nothing', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const findings = await formFor(page, FINDINGS, 'Record a finding', 'Record finding')
      await findings.getByLabel('Section or condition').fill('Future finding')
      await findings.getByLabel('Facts').fill('Should not be stored')
      await fillDate(findings.getByLabel('Inspection date'), FUTURE)
      await findings.getByRole('button', { name: 'Record finding' }).click()
      await expectRefusedBeside(
        findings.getByLabel('Inspection date'),
        `Enter the inspection date ${BEFORE_TODAY}`,
      )
      expect(
        await countRows(db, 'select count(*) from violation_findings where case_id = $1', [caseId]),
      ).toBe(0)
    })

    test('records two findings and moves the case to violation found', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      await recordZoningFinding(
        page,
        'Section 4.2 side setback',
        'The fence stands on the lot line.',
      )
      await recordZoningFinding(page, 'Section 6.1 use of land', 'A second dwelling is rented.')
      const rows = await db.rows<{ status: string }>(
        'select status from violation_findings where case_id = $1',
        [caseId],
      )
      expect(rows.map((r) => r.status)).toEqual(['open', 'open'])
      const row = await db.one<{ status: string }>(
        'select status from enforcement_cases where id = $1',
        [caseId],
      )
      expect(row.status).toBe('violation_found')
    })

    test('refuses a notice with no finding chosen and shows the message once', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const findings = await formFor(page, FINDINGS, SEND, 'Send notice of violation')
      await findings.getByRole('button', { name: 'Send notice of violation' }).click()
      const group = findings.getByRole('group', { name: 'Findings to include' })
      await expect(group.getByText('Choose at least one finding.')).toHaveCount(1)
      await expect(
        findings.getByRole('checkbox', { name: /Section 4\.2 side setback/ }),
      ).toHaveAttribute('aria-invalid', 'true')
      expect(
        await countRows(db, 'select count(*) from violation_notices where case_id = $1', [caseId]),
      ).toBe(0)
    })

    test('sends a notice for one finding, stores the PDF and lists it', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, FINDINGS, SEND, 'Send notice of violation')
      await form.getByRole('checkbox', { name: /Section 4\.2 side setback/ }).check()
      await form.getByLabel('How it was sent').selectOption({ label: 'Certified mail' })
      await form.getByRole('button', { name: 'Send notice of violation' }).click()
      await expectConfirmation(page, 'Notice of violation recorded.')
      const findings = region(page, FINDINGS)
      await expect(
        findings.getByText(/Sent by certified mail on .*Receipt not recorded\./),
      ).toBeVisible()
      await expect(findings.getByRole('link', { name: 'Open notice' })).toBeVisible()
      const row = await db.one<{ method: string; document_id: string | null }>(
        'select method, document_id from violation_notices where case_id = $1',
        [caseId],
      )
      expect(row.method).toBe('certified_mail')
      expect(row.document_id).not.toBeNull()
    })

    test('records how the notice was received and stores the basis', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const basis = `Green card signed, ref ${suffix}`
      const form = await formFor(page, FINDINGS, 'Record receipt', 'Record receipt')
      await form.getByLabel('How receipt is known').fill(basis)
      await form.getByRole('button', { name: 'Record receipt' }).click()
      await expectConfirmation(page, 'Receipt recorded.')
      await expect(region(page, FINDINGS).getByText(`: ${basis}.`)).toBeVisible()
      await expect(
        region(page, FINDINGS).locator('summary', { hasText: 'Record receipt' }),
      ).toHaveCount(0)
      const row = await db.one<{ receipt_basis: string }>(
        'select receipt_basis from violation_notices where case_id = $1',
        [caseId],
      )
      expect(row.receipt_basis).toBe(basis)
    })
  })
