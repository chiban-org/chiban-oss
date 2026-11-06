import { expect, test } from '../fixtures/test'
import {
  candidateRow,
  openControl,
  openDraft,
  recipientData,
  recipientRow,
} from './abutterListSupport'
import {
  confirmDialog,
  confirmWith,
  expectConfirmation,
  expectNoDialog,
  expectRefusedBeside,
} from './support'

const CORRECTED = '4 Merganser Way, Alder Pond NH 03999'
const REASON = /^Reason/
const OWNER = 'Merganser Estates LLC'
const CORRECT = 'Correct the name or address'

test.describe
  .serial('editing a draft abutter list', () => {
    test.use({ role: 'staff' })

    test('refuses issuing while tenant decisions are open and keeps the list a draft', async ({
      page,
      db,
    }) => {
      const listId = await openDraft(page, db)
      await page.getByRole('button', { name: 'Issue list' }).click()
      await confirmWith(page, 'Issue this list?', 'Issue the list')
      await expect(
        page.getByRole('status').filter({ hasText: 'The list cannot be issued yet.' }),
      ).toContainText('Decide whether Cass Pryor owns')
      const row = await db.one<{ status: string }>(
        'select status from abutter_lists where id = $1',
        [listId],
      )
      expect(row.status).toBe('draft')
    })

    test('refuses a correction with no reason beside the reason and stores nothing', async ({
      page,
      db,
    }) => {
      const listId = await openDraft(page, db)
      const form = await openControl(recipientRow(page, OWNER), CORRECT)
      await form.getByLabel('Mailing address').fill(CORRECTED)
      await form.getByRole('button', { name: 'Save correction' }).click()
      await expectRefusedBeside(form.getByLabel(REASON), 'Fill in: Reason.')
      expect((await recipientData(db, listId, 'Merganser Estates')).address).not.toBe(CORRECTED)
    })

    test('corrects a recipient address and keeps the reason', async ({ page, db }) => {
      const listId = await openDraft(page, db)
      const form = await openControl(recipientRow(page, OWNER), CORRECT)
      await form.getByLabel('Mailing address').fill(CORRECTED)
      await form.getByLabel(REASON).fill('Owner moved the mailing box')
      await form.getByRole('button', { name: 'Save correction' }).click()
      await expectConfirmation(page, 'Name and address updated.')
      expect((await recipientData(db, listId, 'Merganser Estates')).address).toBe(CORRECTED)
    })

    test('refuses a tenant decision with no reason beside the reason', async ({ page, db }) => {
      const listId = await openDraft(page, db)
      const form = await openControl(recipientRow(page, 'Cass Pryor'), 'Decide whether')
      await form.getByRole('button', { name: 'Record decision' }).click()
      await expectRefusedBeside(form.getByLabel(REASON), 'Fill in: Reason.')
      expect((await recipientData(db, listId, 'Cass Pryor')).qualifies).toBeNull()
    })

    test('decides both tenants and stores the answers with reasons', async ({ page, db }) => {
      const listId = await openDraft(page, db)
      const yes = await openControl(recipientRow(page, 'Cass Pryor'), 'Decide whether')
      await yes.getByLabel(REASON).fill('Deed shows a manufactured home on the lot')
      await yes.getByRole('button', { name: 'Record decision' }).click()
      await expectConfirmation(page, 'Decision recorded.')
      const no = await openControl(recipientRow(page, 'Ines Thorne'), 'Decide whether')
      await no
        .getByLabel('Owns manufactured housing that adjoins or is directly across')
        .selectOption({ label: 'No, leave off' })
      await no.getByLabel(REASON).fill('Tenant moved away last year')
      await no.getByRole('button', { name: 'Record decision' }).click()
      await expect(page.getByText('Decide whether Ines Thorne owns')).toHaveCount(0)
      expect(await recipientData(db, listId, 'Cass Pryor')).toMatchObject({
        qualifies: true,
        decision_reason: 'Deed shows a manufactured home on the lot',
      })
      expect(await recipientData(db, listId, 'Ines Thorne')).toMatchObject({
        qualifies: false,
        decision_reason: 'Tenant moved away last year',
      })
    })

    test('refuses leaving a parcel off with no reason and opens no dialog', async ({
      page,
      db,
    }) => {
      await openDraft(page, db)
      const form = await openControl(candidateRow(page, '009014000000'), 'Leave off')
      await form.getByRole('button', { name: 'Leave off the list' }).click()
      await expectRefusedBeside(form.getByLabel(REASON), 'Fill in: Reason.')
      await expectNoDialog(page)
    })

    test('leaves a parcel off after the dialog and stores the exclusion reason', async ({
      page,
      db,
    }) => {
      const listId = await openDraft(page, db)
      const form = await openControl(candidateRow(page, '009014000000'), 'Leave off')
      await form.getByLabel(REASON).fill('Parcel is the applicant own lot')
      await form.getByRole('button', { name: 'Leave off the list' }).click()
      await expect(confirmDialog(page, /off the list\?$/)).toBeVisible()
      await confirmWith(page, /off the list\?$/, 'Leave it off')
      await expectConfirmation(page, 'Parcel left off the list.')
      const row = await db.one<{ excluded: boolean; exclusion_reason: string | null }>(
        'select excluded, exclusion_reason from abutter_list_candidates where list_id = $1 and excluded',
        [listId],
      )
      expect(row).toEqual({ excluded: true, exclusion_reason: 'Parcel is the applicant own lot' })
    })

    test('confirms the streets and streams were reviewed', async ({ page, db }) => {
      const listId = await openDraft(page, db)
      await page.getByRole('button', { name: 'Confirm streets and streams were reviewed' }).click()
      await expectConfirmation(page, 'Recorded: streets and streams were reviewed.')
      const row = await db.one<{ crossings_attested_at: Date | null }>(
        'select crossings_attested_at from abutter_lists where id = $1',
        [listId],
      )
      expect(row.crossings_attested_at).not.toBeNull()
    })

    test('issues the list after the dialog and marks it issued', async ({ page, db }) => {
      const listId = await openDraft(page, db)
      await page.getByRole('button', { name: 'Issue list' }).click()
      await confirmWith(page, 'Issue this list?', 'Issue the list')
      await expectConfirmation(page, 'List issued. Notice costs were calculated from it.')
      const row = await db.one<{ status: string; issued_at: Date | null }>(
        'select status, issued_at from abutter_lists where id = $1',
        [listId],
      )
      expect(row.status).toBe('issued')
      expect(row.issued_at).not.toBeNull()
    })
  })
