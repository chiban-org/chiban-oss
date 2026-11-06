import { expect, test } from '../fixtures/test'
import { demoTitle, openApplication } from './support'

const SHED = demoTitle('Shed ready to issue')

test.describe('recording the state building code edition', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('records the edition in force again and stamps a new record time', async ({
      page,
      db,
    }) => {
      const id = await openApplication(page, db, SHED)
      const before = await db.one<{ recorded_at: Date }>(
        'select recorded_at from code_edition_records where application_id = $1',
        [id],
      )
      const region = page.getByRole('region', { name: 'Code edition' })
      await region.getByText('Record the edition again', { exact: true }).click()
      await region.getByRole('button', { name: 'Record again' }).click()

      await expect(region.getByRole('status')).toHaveText('Code edition recorded.')
      const row = await db.one<{ applicant_election: string | null; edition_key: string }>(
        'select applicant_election, edition_key from code_edition_records where application_id = $1',
        [id],
      )
      expect(row.applicant_election).toBeNull()
      const after = await db.one<{ recorded_at: Date }>(
        'select recorded_at from code_edition_records where application_id = $1',
        [id],
      )
      expect(after.recorded_at.getTime()).toBeGreaterThan(before.recorded_at.getTime())
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is not offered the form to record the edition', async ({ page, db }) => {
      await openApplication(page, db, SHED)
      const region = page.getByRole('region', { name: 'Code edition' })
      await expect(
        region.getByRole('heading', { name: 'State building code edition' }),
      ).toBeVisible()
      await expect(region.getByText('Record the edition again', { exact: true })).toHaveCount(0)
    })
  })
})
