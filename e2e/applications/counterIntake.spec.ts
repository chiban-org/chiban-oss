import { accountFor, expect, test, uniqueEmail } from '../fixtures/test'
import { fillVarianceAndSubmit, intakeFor, openVarianceApplicant } from './counterIntakeSupport'

test.describe('taking an application for review at the counter', () => {
  test.use({ role: 'staff' })

  test('takes a walk-in variance with the fee and lands it in the staff review queue', async ({
    page,
    db,
    suffix,
  }) => {
    const email = uniqueEmail('walk-in', suffix)
    const name = `Morgan Reyes ${suffix}`
    await openVarianceApplicant(page, email)
    await expect(page.getByText(`No account uses ${email}.`)).toBeVisible()
    await page.getByLabel('Applicant name').fill(name)
    await page.getByRole('button', { name: 'Take the application' }).click()

    await fillVarianceAndSubmit(page, name)
    await page.getByLabel('Paid by').selectOption({ label: 'Cash' })
    await page.getByLabel('Cash tendered in dollars (cash only, to work out change)').fill('500')
    await page.getByLabel('Payer name').fill(name)
    await page.getByRole('button', { name: 'Record payment' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'is submitted for review.' }),
    ).toBeVisible()

    const intake = await intakeFor(db, email)
    expect(intake).toMatchObject({ state: 'submitted', user_id: null })
    await page.goto(`/staff/applications?tab=all&q=${intake.number}`)
    await expect(page.getByRole('link', { name: intake.number })).toBeVisible()
    await page.getByRole('link', { name: intake.number }).click()
    await expect(
      page
        .getByRole('region', { name: 'Key facts' })
        .getByText('Taken at the counter by Sam Clerk'),
    ).toBeVisible()
  })

  test('gives the application to an applicant who has an account, in their portal', async ({
    page,
    pageAs,
    db,
  }) => {
    const applicant = accountFor('applicant')
    await openVarianceApplicant(page, applicant.email)
    await page
      .getByRole('button', { name: `Take the application for ${applicant.displayName}` })
      .click()
    await fillVarianceAndSubmit(page, applicant.displayName)
    await page
      .getByRole('link', { name: 'Finish without taking payment. The applicant pays later.' })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: 'is submitted for review.' }),
    ).toBeVisible()

    const rows = await db.rows<{ number: string }>(
      `select a.number from counter_intakes ci
         join applications a on a.id = ci.application_id
         join project_parties pp on pp.id = ci.applicant_party_id
        where pp.user_id = $1 order by ci.taken_at desc limit 1`,
      [await db.userIdFor(applicant.email)],
    )
    const number = rows[0]?.number ?? ''
    expect(number).toMatch(/^VAR-/)
    const portal = await pageAs('applicant')
    await portal.goto('/portal')
    await expect(portal.getByText(new RegExp(`^${number}, started `))).toBeVisible()
  })
})
