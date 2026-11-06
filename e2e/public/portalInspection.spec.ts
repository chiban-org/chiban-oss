import { licenseApplication } from '../applications/counterSupport'
import { expectRefusedBeside } from '../applications/support'
import { expect, test } from '../fixtures/test'
import { claimAs, issueAndSendClaim } from './claimSupport'

test.describe('requesting and cancelling an inspection from the portal', () => {
  test.use({ role: 'staff' })

  test('the contractor requests an inspection, is refused a blank name, then cancels after confirming', async ({
    page,
    pageAs,
    db,
    suffix,
  }) => {
    const { job, link } = await issueAndSendClaim(page, suffix)
    const contractor = await pageAs('anonymous')
    await claimAs(contractor, job.email, link)
    const permit = await licenseApplication(db, job.license)
    await contractor.goto(`/portal/applications/${permit.application_id}/inspections`)
    await expect(contractor.getByRole('heading', { level: 1 })).toHaveText(
      `Inspections for ${permit.number}`,
    )

    const form = contractor.getByRole('region', { name: 'Request an inspection' })
    await form.getByLabel('Contact name').fill('   ')
    await form.getByRole('button', { name: 'Request inspection' }).click()
    await expectRefusedBeside(form.getByLabel('Contact name'), 'Enter a contact name.')
    expect(
      await db.rows('select id from inspections where application_id = $1', [
        permit.application_id,
      ]),
    ).toHaveLength(0)

    await form.getByLabel('Contact name').fill(`Pat Wiring ${suffix}`)
    await form.getByRole('button', { name: 'Request inspection' }).click()
    const mine = contractor
      .getByRole('region', { name: 'Your inspections' })
      .getByRole('listitem')
      .filter({ hasText: 'Requested' })
    await expect(mine).toHaveCount(1)
    const row = await db.one<{ status: string; channel: string; contact_name: string }>(
      'select status, channel, contact_name from inspections where application_id = $1',
      [permit.application_id],
    )
    expect(row).toEqual({
      status: 'requested',
      channel: 'portal',
      contact_name: `Pat Wiring ${suffix}`,
    })

    await mine.getByRole('button', { name: 'Cancel this request' }).click()
    const dialog = contractor.getByRole('dialog', { name: 'Cancel this inspection request?' })
    await dialog.getByRole('button', { name: 'Keep the request' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(mine).toHaveCount(1)
    await mine.getByRole('button', { name: 'Cancel this request' }).click()
    await dialog.getByRole('button', { name: 'Cancel the request' }).click()
    await expect(
      contractor
        .getByRole('region', { name: 'Your inspections' })
        .getByRole('listitem')
        .filter({ hasText: 'Cancelled' }),
    ).toHaveCount(1)
    const done = await db.one<{ status: string }>(
      'select status from inspections where application_id = $1',
      [permit.application_id],
    )
    expect(done.status).toBe('cancelled')
  })
})
