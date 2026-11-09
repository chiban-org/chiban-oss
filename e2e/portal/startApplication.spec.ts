import { expect, signInWithMagicLink, test, uniqueEmail } from '../fixtures/test'

const PARCEL_ADDRESS = '12 Tamarack Way'
const TYPE_LABEL = 'Driveway permit'

interface StartedRow {
  id: string
  number: string
  state: string
  application_type_key: string
  created_by: string
  title: string
}

test('a new applicant signs in by emailed link and starts a driveway permit on their parcel', async ({
  page,
  db,
  suffix,
}) => {
  const email = uniqueEmail('applicant', suffix)
  await page.goto('/portal/apply')
  await expect(page).toHaveURL('/sign-in?next=%2Fportal%2Fapply')
  await signInWithMagicLink(page, email)
  await expect(page).toHaveURL('/portal/apply')

  await page.getByLabel('Find your parcel by address, owner, or parcel ID').fill(PARCEL_ADDRESS)
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('link', { name: new RegExp(`^${PARCEL_ADDRESS}, parcel `) }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose the kind of application')
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByRole('radio', { name: /^Driveway/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/portal\/applications\/[0-9a-f-]{36}$/)

  const started = await db.one<StartedRow>(
    `select a.id, a.number, a.state, a.application_type_key, a.created_by, p.title
       from applications a join projects p on p.id = a.project_id
      where a.created_by = (select id from users where email = $1)`,
    [email],
  )
  await expect(page).toHaveURL(`/portal/applications/${started.id}`)
  expect(started).toMatchObject({
    state: 'draft',
    application_type_key: 'DW',
    title: `${TYPE_LABEL}, ${PARCEL_ADDRESS}`,
  })
  expect(started.number).toMatch(/^DW-\d{4}-\d{4}$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(started.title)
  await expect(page.getByText(started.number).first()).toBeVisible()
})
