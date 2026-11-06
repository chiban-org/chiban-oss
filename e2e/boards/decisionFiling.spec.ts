import { expect, test } from '../fixtures/test'
import { permissionAlert } from './confirm'
import { applicationIdFor, daysFromToday, townToday } from './records'
import { expectRefused } from './refusal'
import { uploadPdf } from './upload'

const APPLICATION = 'Heron Cove setback variance'

interface DecisionRow {
  id: string
  written_decision_document_id: string | null
  letter_document_id: string | null
  filed_on: string | null
  minutes_document_id: string | null
}

async function decisionOf(db: Parameters<typeof applicationIdFor>[0]): Promise<DecisionRow> {
  return await db.one<DecisionRow>(
    `select id, written_decision_document_id, letter_document_id, filed_on::text, minutes_document_id
     from board_decisions where application_id = $1`,
    [await applicationIdFor(db, APPLICATION)],
  )
}

test.describe
  .serial('decision documents, filing and appeals', () => {
    test.use({ role: 'staff' })
    let minutesTitle: string

    test('creates the notice of decision and the letter', async ({ page, db, suffix }) => {
      minutesTitle = `Minutes of the vote ${suffix}`
      const before = await decisionOf(db)
      expect(before.written_decision_document_id).toBeNull()
      await page.goto(`/staff/boards/decisions/${before.id}`)
      await page.getByRole('button', { name: 'Create the Notice of Decision' }).click()
      await expect(
        page.getByText('The Notice of Decision and the decision letter are on the application.'),
      ).toBeVisible()
      const after = await decisionOf(db)
      expect(after.written_decision_document_id).not.toBeNull()
      expect(after.letter_document_id).not.toBeNull()
    })

    test('refuses filing before minutes are chosen and files nothing', async ({ page, db }) => {
      const decision = await decisionOf(db)
      await page.goto(`/staff/boards/decisions/${decision.id}`)
      await page.getByRole('button', { name: 'File the decision' }).click()
      await expectRefused(page.getByLabel(/^Minutes/), 'Fill in: Minutes.')
      expect((await decisionOf(db)).filed_on).toBeNull()
    })

    test('refuses a filing date before the vote beside the date field', async ({ page, db }) => {
      const decision = await decisionOf(db)
      await page.goto(`/staff/boards/decisions/${decision.id}`)
      await page.getByLabel(/^Date filed/).fill('2026-10-01')
      await page.getByRole('button', { name: 'File the decision' }).click()
      await expectRefused(page.getByLabel(/^Date filed/), 'Check: Date filed.')
      expect((await decisionOf(db)).filed_on).toBeNull()
    })

    test('uploads the minutes to storage and files the decision with them', async ({
      page,
      db,
    }) => {
      const decision = await decisionOf(db)
      await page.goto(`/staff/boards/decisions/${decision.id}`)
      const filing = page.getByRole('region', { name: 'Filing' })
      await uploadPdf(filing, 'Upload the minutes', minutesTitle)
      await filing.getByLabel(/^Minutes/).selectOption({ label: minutesTitle })
      await filing.getByRole('button', { name: 'File the decision' }).click()
      await expect(page.getByText('The decision and minutes are public.')).toBeVisible()
      const filed = await decisionOf(db)
      expect(filed.filed_on).toBe(await townToday(db))
      expect(filed.minutes_document_id).not.toBeNull()
    })

    test('refuses an appeal step dated after today and records nothing', async ({ page, db }) => {
      const decision = await decisionOf(db)
      await page.goto(`/staff/boards/decisions/${decision.id}`)
      await page.getByText('Record an appeal step', { exact: true }).click()
      await page.getByLabel(/^Date/).fill(await daysFromToday(db, 5))
      await page.getByRole('button', { name: 'Record', exact: true }).click()
      await expectRefused(page.getByLabel(/^Date/), 'Check: Date.')
    })

    test('records the rehearing decision on the appeal graph', async ({ page, db }) => {
      const decision = await decisionOf(db)
      await page.goto(`/staff/boards/decisions/${decision.id}`)
      await page.getByText('Record an appeal step', { exact: true }).click()
      const follows = page.getByLabel('Follows')
      const motion = await follows
        .locator('option', { hasText: 'Motion for rehearing' })
        .getAttribute('value')
      await follows.selectOption(motion ?? '')
      await page.getByLabel('Step').selectOption('rehearing_outcome')
      await page.getByLabel(/^Result/).selectOption('denied')
      await page.getByRole('button', { name: 'Record', exact: true }).click()
      await expect(page.getByText('Recorded on the appeal graph.')).toBeVisible()
      const nodes = await db.rows(
        "select 1 from appeal_nodes where application_id = $1 and kind = 'rehearing_outcome' and outcome = 'denied'",
        [await applicationIdFor(db, APPLICATION)],
      )
      expect(nodes).toHaveLength(1)
    })
  })

test.describe('decision page without the capability', () => {
  test.use({ role: 'records' })

  test('says the records custodian may not work with board decisions', async ({ page, db }) => {
    await page.goto(`/staff/boards/decisions/${(await decisionOf(db)).id}`)
    await expect(permissionAlert(page)).toHaveText(
      'You do not have permission to work with board decisions.',
    )
  })
})
