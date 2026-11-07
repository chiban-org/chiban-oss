import { expect, test } from '../fixtures/test'

test.use({ role: 'staff' })

const LINK = 'See what the public sees'

test.describe('See what the public sees', () => {
  test('opens the public parcel page from the staff parcel page and an application', async ({
    page,
    db,
  }) => {
    const app = await db.one<{ application_id: string; parcel_id: string }>(
      `select a.id as application_id, p.parcel_id from documents d
       join applications a on a.id = d.record_id
       join projects p on p.id = a.project_id
       where d.title = 'Site sketch' and d.record_kind = 'application'`,
    )
    await page.goto(`/staff/parcels/${app.parcel_id}`)
    const parcelLink = page.locator('header').getByRole('link', { name: LINK })
    await expect(parcelLink).toHaveAttribute('href', `/parcels/${app.parcel_id}`)
    await expect(parcelLink).toHaveAttribute('target', '_blank')

    await page.goto(`/staff/applications/${app.application_id}`)
    await expect(page.locator('header').getByRole('link', { name: LINK })).toHaveAttribute(
      'href',
      `/parcels/${app.parcel_id}`,
    )
  })

  test('offers the link on a public case with a parcel and not on a private case', async ({
    page,
    db,
  }) => {
    const shown = await db.one<{ id: string; parcel_id: string }>(
      'select id, parcel_id from enforcement_cases where is_public and parcel_id is not null limit 1',
    )
    await page.goto(`/staff/enforcement/${shown.id}`)
    await expect(page.locator('header').getByRole('link', { name: LINK })).toHaveAttribute(
      'href',
      `/parcels/${shown.parcel_id}`,
    )

    const hidden = await db.one<{ id: string }>(
      'select id from enforcement_cases where not is_public and parcel_id is not null limit 1',
    )
    await page.goto(`/staff/enforcement/${hidden.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: LINK })).toHaveCount(0)
  })
})
