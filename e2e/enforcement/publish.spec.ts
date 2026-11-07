import { expect, test } from '../fixtures/test'
import { countRows, expectConfirmation, expectRefusedBeside, openSummary, region } from './support'

test.describe
  .serial('public text, publishing and unpublishing a case', () => {
    test.use({ role: 'staff' })
    let caseId = ''
    let description = ''
    const summary = (suffix: string) => `A shed near the lot line is under review, ref ${suffix}`

    test('enters a complaint that opens a case with the complaint on it', async ({
      page,
      db,
      suffix,
    }) => {
      description = `Shed close to my fence, ref ${suffix}`
      await page.goto('/staff/enforcement')
      await page.getByRole('button', { name: 'Enter a complaint' }).click()
      const dialog = page.getByRole('dialog', {
        name: 'Enter a complaint taken by phone or at the counter',
      })
      await dialog.getByLabel('Where is the property?').fill(`71 Sedge Walk ${suffix}`)
      await dialog.getByLabel('What was reported?').fill(description)
      await dialog.getByRole('button', { name: 'Record complaint' }).click()
      await page.waitForURL(/\/staff\/enforcement\/[0-9a-f-]{36}$/)
      const row = await db.one<{ case_id: string }>(
        'select case_id from complaints where description_original = $1',
        [description],
      )
      caseId = row.case_id
    })

    test('refuses to publish while the complaint has no public text', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const complaints = region(page, 'Complaints')
      const form = await openSummary(complaints, 'Show the case on the public site')
      await form.getByLabel('Public summary').fill(summary(suffix))
      await form.getByRole('button', { name: 'Show the case on the public site' }).click()
      await expect(
        form.getByText(
          'Write the public text for every complaint before showing the case on the public site.',
        ),
      ).toBeVisible()
      const row = await db.one<{ is_public: boolean }>(
        'select is_public from enforcement_cases where id = $1',
        [caseId],
      )
      expect(row.is_public).toBe(false)
    })

    test('refuses blank public text beside the field, then saves it', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const complaints = region(page, 'Complaints')
      const form = await openSummary(complaints, 'Write the public text')
      const field = form.getByLabel(/^Public text\./)
      await field.fill('   ')
      await form.getByRole('button', { name: 'Save public text' }).click()
      await expectRefusedBeside(field, 'Enter the public text.')

      await field.fill(`A shed stands near a lot line, ref ${suffix}`)
      await form.getByRole('button', { name: 'Save public text' }).click()
      await expectConfirmation(page, 'Public text saved.')
      expect(
        await countRows(db, 'select count(*) from complaints where description_public = $1', [
          `A shed stands near a lot line, ref ${suffix}`,
        ]),
      ).toBe(1)
    })

    test('refuses a blank public summary beside the field, then publishes the case', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const complaints = region(page, 'Complaints')
      const form = await openSummary(complaints, 'Show the case on the public site')
      await form.getByLabel('Public summary').fill('   ')
      await form.getByRole('button', { name: 'Show the case on the public site' }).click()
      await expectRefusedBeside(form.getByLabel('Public summary'), 'Enter a public summary.')

      await form.getByLabel('Public summary').fill(summary(suffix))
      await form.getByRole('button', { name: 'Show the case on the public site' }).click()
      await expectConfirmation(page, 'The case is now shown on the public site.')
      await expect(
        complaints.getByText(`This case is shown on the public site. Summary: ${summary(suffix)}`),
      ).toBeVisible()
      const row = await db.one<{ is_public: boolean; public_summary: string }>(
        'select is_public, public_summary from enforcement_cases where id = $1',
        [caseId],
      )
      expect(row).toEqual({ is_public: true, public_summary: summary(suffix) })
    })

    test('makes the case private only after a confirmed dialog', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const complaints = region(page, 'Complaints')
      await complaints.getByRole('button', { name: 'Hide the case from the public site' }).click()
      const dialog = page.getByRole('dialog', { name: 'Hide this case from the public site?' })
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toHaveCount(0)
      const still = await db.one<{ is_public: boolean }>(
        'select is_public from enforcement_cases where id = $1',
        [caseId],
      )
      expect(still.is_public).toBe(true)

      await complaints.getByRole('button', { name: 'Hide the case from the public site' }).click()
      await dialog.getByRole('button', { name: 'Hide it' }).click()
      await expectConfirmation(page, 'The case is hidden from the public site.')
      const row = await db.one<{ is_public: boolean }>(
        'select is_public from enforcement_cases where id = $1',
        [caseId],
      )
      expect(row.is_public).toBe(false)
    })
  })
