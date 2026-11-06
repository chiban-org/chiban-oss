import type { Page } from '@playwright/test'
import { confirmDialog } from '../boards/confirm'
import { expect, linkIn, test, uniqueEmail, waitForEmail } from '../fixtures/test'
import { expectGroupRefusal, expectRefusedBeside } from './refusal'
import { expectToast, logRequestViaForm, openDetails, openRequest, section } from './requestSupport'

test.use({ role: 'records' })

const DOCUMENT = 'Permit correspondence for the Birch Lane renovation'
const APPROVED = `${DOCUMENT}: Original`

async function approveDocument(page: Page, requestId: string) {
  await page.goto(`/staff/records/requests/${requestId}?find=${encodeURIComponent(DOCUMENT)}`)
  const releases = section(page, 'Releases')
  await releases.getByLabel('Document and version').selectOption({ index: 0 })
  await releases
    .getByLabel('What you checked before approving')
    .fill('Read every page, nothing exempt.')
  await releases.getByRole('button', { name: 'Approve for release' }).click()
  await expectToast(page, 'Version approved.')
  await expect(releases.getByRole('paragraph').filter({ hasText: APPROVED })).toBeVisible()
}

test.describe('approving a version and releasing records', () => {
  test('refuses an approval with no review statement beside the field', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Birch Lane letters, refusal ${suffix}`)
    await page.goto(`/staff/records/requests/${id}?find=${encodeURIComponent(DOCUMENT)}`)
    const releases = section(page, 'Releases')
    const statement = releases.getByLabel('What you checked before approving')
    await statement.fill('   ')
    await releases.getByRole('button', { name: 'Approve for release' }).click()
    await expectRefusedBeside(statement, 'Enter')
    const rows = await db.rows('select 1 from rendition_approvals where rtk_request_id = $1', [id])
    expect(rows).toHaveLength(0)
  })

  test('releases an approved record by email after validation, and the link arrives in Mailpit', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Birch Lane letters, release ${suffix}`)
    await approveDocument(page, id)
    const releases = section(page, 'Releases')
    await openDetails(releases, 'Release approved records')
    const submit = releases.getByRole('button', { name: 'Release', exact: true })
    const dialog = confirmDialog(page, 'Release these records?')

    await submit.click()
    await expectGroupRefusal(
      releases.getByRole('group', { name: 'Records in this release' }),
      'Tick at least one approved record to release.',
    )
    await expect(dialog).toHaveCount(0)

    await releases.getByRole('checkbox', { name: APPROVED }).check()
    await releases.getByLabel('How').selectOption('electronic_link')
    await submit.click()
    await expectRefusedBeside(
      releases.getByLabel('Email address, for a link'),
      'Enter the email address for the link.',
    )
    await expect(dialog).toHaveCount(0)

    const recipient = uniqueEmail('requester', suffix)
    const since = new Date()
    await releases.getByLabel('Email address, for a link').fill(recipient)
    await submit.click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Release the records' }).click()
    await expectToast(page, 'Records released.')
    await expect(releases.getByText(/^Release 1, .*Link sent by email$/)).toBeVisible()

    const row = await db.one<{ method: string; sequence: number }>(
      'select method, sequence from rtk_releases where request_id = $1',
      [id],
    )
    expect(row).toEqual({ method: 'electronic_link', sequence: 1 })
    const mail = await waitForEmail({ to: recipient, since })
    const number = (
      await db.one<{ number: string }>('select number from rtk_requests where id = $1', [id])
    ).number
    expect(mail.subject).toBe(`Records for request ${number}`)
    expect(linkIn(mail, 'http')).toContain('/')
  })
})
