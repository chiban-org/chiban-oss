import { expect, test } from '../fixtures/test'
import { demoTitle, expectConfirmation, expectRefusedBeside, openApplication } from './support'

const PERMIT = demoTitle('Bittern Meadow frontage variance')

test.describe
  .serial('abutter lists from the application page', () => {
    let listId = ''

    test.describe('as staff', () => {
      test.use({ role: 'staff' })

      test('draws a new list and stores a draft for the application', async ({ page, db }) => {
        const applicationId = await openApplication(page, db, PERMIT)
        const drawn = await db.one<{ version: number }>(
          'select coalesce(max(version), 0)::int as version from abutter_lists where application_id = $1',
          [applicationId],
        )
        const lists = page.getByRole('region', { name: 'Abutter lists' })
        await lists.getByRole('button', { name: 'Draw a new list' }).click()
        await expectConfirmation(page, `Draft list version ${drawn.version + 1} drawn.`)
        const row = await db.one<{ id: string; status: string }>(
          "select id, status from abutter_lists where application_id = $1 and status = 'draft'",
          [applicationId],
        )
        expect(row.status).toBe('draft')
        listId = row.id
      })

      test('refuses a professional with no name beside the name and stores nothing', async ({
        page,
        db,
      }) => {
        const applicationId = await openApplication(page, db, PERMIT)
        const lists = page.getByRole('region', { name: 'Abutter lists' })
        await lists.getByText('Add a professional whose seal is on the plat').click()
        await lists.getByLabel('Business address').fill('9 Heron Row, Alder Pond NH 03999')
        await lists.getByRole('button', { name: 'Add professional' }).click()
        await expectRefusedBeside(lists.getByLabel(/^Name/), 'Fill in: Name.')
        const rows = await db.rows(
          'select 1 from application_professionals where application_id = $1',
          [applicationId],
        )
        expect(rows).toEqual([])
      })

      test('adds a professional and stores the profession and seal', async ({
        page,
        db,
        suffix,
      }) => {
        const name = `Pat Surveyor ${suffix}`
        const applicationId = await openApplication(page, db, PERMIT)
        const lists = page.getByRole('region', { name: 'Abutter lists' })
        await lists.getByText('Add a professional whose seal is on the plat').click()
        await lists.getByLabel(/^Name/).fill(name)
        await lists.getByLabel('Business address').fill('9 Heron Row, Alder Pond NH 03999')
        await lists.getByRole('button', { name: 'Add professional' }).click()
        await expectConfirmation(page, 'Professional added.')
        await expect(lists.getByText(name)).toBeVisible()
        const rows = await db.rows<{ profession: string }>(
          'select profession from application_professionals where application_id = $1 and name = $2',
          [applicationId, name],
        )
        expect(rows).toEqual([{ profession: 'land_surveyor' }])
      })

      test('refuses a parcel that was typed but never picked, beside the parcel', async ({
        page,
      }) => {
        await page.goto(`/staff/abutters/${listId}`)
        await page.getByText('Add a parcel across a street or stream').click()
        const picker = page.getByRole('combobox', { name: /^Parcel/ })
        await picker.fill('not a parcel')
        await page.getByLabel(/^Why it belongs/).fill('Across the brook from the lot')
        await page.getByRole('button', { name: 'Add parcel' }).click()
        await expectRefusedBeside(picker, 'Check: Parcel.')
      })

      test('adds a picked parcel across a stream and stores it as a candidate', async ({
        page,
        db,
      }) => {
        await page.goto(`/staff/abutters/${listId}`)
        await page.getByText('Add a parcel across a street or stream').click()
        await page.getByRole('combobox', { name: /^Parcel/ }).fill('009016')
        await page.getByRole('option', { name: /^009016000000/ }).click()
        await page.getByLabel('Across a').selectOption({ label: 'Stream' })
        await page.getByLabel(/^Why it belongs/).fill('Across the brook from the lot')
        await page.getByRole('button', { name: 'Add parcel' }).click()
        await expectConfirmation(page, 'Parcel added to the list.')
        const rows = await db.rows(
          'select 1 from abutter_list_candidates where list_id = $1 and reasons::text like $2',
          [listId, '%stream%'],
        )
        expect(rows.length).toBeGreaterThan(0)
      })
    })

    test.describe('as finance', () => {
      test.use({ role: 'finance' })

      test('the list page refuses and the application page has no draw form', async ({
        page,
        db,
      }) => {
        await page.goto(`/staff/abutters/${listId}`)
        await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Issue list' })).toHaveCount(0)
        await openApplication(page, db, PERMIT)
        await expect(page.getByRole('button', { name: 'Draw a new list' })).toHaveCount(0)
      })
    })
  })
