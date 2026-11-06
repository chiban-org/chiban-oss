import { expect, fillDate, test } from '../fixtures/test'
import { chooseRequest, inspectionOf } from './inspectionSupport'
import { demoTitle, expectRefusedBeside, openApplication } from './support'

const DECK_NUMBER = 'BP-2025-0001'
const DECK = demoTitle('Deck renewed once')
const SLOTS = 'Open slots'

test.describe('a final inspection leading to the certificate of occupancy', () => {
  test.describe.configure({ mode: 'serial' })

  test('the clerk requests the final inspection and books the first open time', async ({
    pageAs,
    db,
    suffix,
  }) => {
    const page = await pageAs('staff')
    await page.goto('/staff/inspections')
    const section = page.getByRole('region', { name: 'Take a request' })
    await section.getByLabel('Permit number').fill(DECK_NUMBER)
    await section.getByRole('button', { name: 'Find permit' }).click()
    await section.getByRole('radio', { name: 'Final inspection' }).click()
    await section.getByLabel('Contact name').fill(`Dana Builder ${suffix}`)
    await section.getByRole('button', { name: 'Record request' }).click()
    await chooseRequest(page, `${DECK_NUMBER}, Final`)
    const firstDay = page.getByRole('region', { name: SLOTS }).getByRole('listitem').first()
    await firstDay.getByRole('button').first().click()

    await expect(page.getByRole('region', { name: SLOTS }).getByRole('status')).toHaveText(
      'Scheduled. The inspector gets a calendar invite.',
    )
    expect((await inspectionOf(db, DECK_NUMBER, 'final')).status).toBe('scheduled')
  })

  test('the inspector passes the final inspection', async ({ pageAs, db }) => {
    const page = await pageAs('inspector')
    const final = await inspectionOf(db, DECK_NUMBER, 'final', 'scheduled')
    await page.goto(`/staff/inspections/${final.id}`)
    const groups = page.getByRole('radiogroup')
    await expect(groups.first()).toBeVisible()
    const count = await groups.count()
    for (let index = 0; index < count; index += 1) {
      await groups.nth(index).getByRole('radio', { name: 'Pass' }).click()
    }
    await page.getByRole('button', { name: 'Record result' }).click()

    await expect(page.getByRole('region', { name: 'Result' })).toContainText(
      'Work matches approved plans: Pass',
    )
    expect((await inspectionOf(db, DECK_NUMBER, 'final')).status).toBe('passed')
  })

  test('the clerk is refused an issue date in the future beside the field', async ({
    pageAs,
    db,
  }) => {
    const page = await pageAs('staff')
    const id = await openApplication(page, db, DECK)
    const inspections = page.getByRole('region', { name: 'Inspections', exact: true })
    await fillDate(inspections.getByLabel('Issue date'), '2099-05-06')
    await inspections.getByRole('button', { name: 'Issue the certificate of occupancy' }).click()

    await expectRefusedBeside(
      inspections.getByLabel('Issue date'),
      'The issue date cannot be in the future.',
    )
    const rows = await db.rows<{ id: string }>(
      'select id from certificates_of_occupancy where application_id = $1',
      [id],
    )
    expect(rows).toHaveLength(0)
  })

  test('the inspector is not offered the certificate form', async ({ pageAs, db }) => {
    const page = await pageAs('inspector')
    await openApplication(page, db, DECK)
    await expect(page.getByRole('region', { name: 'Inspections', exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Issue the certificate of occupancy' }),
    ).toHaveCount(0)
  })

  test('the clerk issues the certificate of occupancy', async ({ pageAs, db }) => {
    const page = await pageAs('staff')
    const id = await openApplication(page, db, DECK)
    const inspections = page.getByRole('region', { name: 'Inspections', exact: true })
    await inspections.getByRole('button', { name: 'Issue the certificate of occupancy' }).click()

    await expect
      .poll(
        async () =>
          (
            await db.rows('select id from certificates_of_occupancy where application_id = $1', [
              id,
            ])
          ).length,
      )
      .toBe(1)
    const issued = await db.one<{ number: string }>(
      'select number from certificates_of_occupancy where application_id = $1',
      [id],
    )
    await expect(page.getByText(`Certificate ${issued.number} issued.`)).toBeVisible()
  })
})
