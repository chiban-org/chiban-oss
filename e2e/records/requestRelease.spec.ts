import { confirmDialog } from '../boards/confirm'
import { expect, linkIn, test, uniqueEmail, waitForEmail } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import {
  approveFound,
  expectToast,
  logRequestViaForm,
  openRequest,
  section,
  workCard,
} from './requestSupport'

test.use({ role: 'records' })

const DOCUMENT = 'Permit correspondence for the Birch Lane renovation'

test.describe('approving a version and releasing records', () => {
  test('refuses an approval with no review statement beside the field', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Birch Lane letters, refusal ${suffix}`)
    await openRequest(page, id, DOCUMENT)
    const card = workCard(page)
    await expect(card.getByRole('radio', { name: 'Release the records now' })).toBeChecked()
    await expect(
      card.getByRole('status').filter({ hasText: /^Found \d+ documents? for / }),
    ).toBeFocused()
    const version = card
      .getByRole('list', { name: `Versions of ${DOCUMENT}` })
      .getByRole('listitem')
      .first()
    const statement = version.getByLabel('What you checked before approving')
    await statement.fill('   ')
    await version.getByRole('button', { name: new RegExp(`^Approve ${DOCUMENT}`) }).click()
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
    await openRequest(page, id, DOCUMENT)
    await approveFound(page, DOCUMENT)
    const card = workCard(page)
    const submit = card.getByRole('button', { name: 'Release 1 record' })
    const dialog = confirmDialog(page, 'Release these records?')

    await card.getByLabel('How').selectOption('electronic_link')
    await submit.click()
    await expectRefusedBeside(
      card.getByLabel("Requester's email address"),
      'Enter the email address to send the records to.',
    )
    await expect(dialog).toHaveCount(0)

    const recipient = uniqueEmail('requester', suffix)
    const since = new Date()
    await card.getByLabel("Requester's email address").fill(recipient)
    await submit.click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Release the records' }).click()
    await expectToast(page, 'Records released and a link emailed to the requester.')
    const releases = section(page, 'Releases')
    await expect(releases.getByText(/^Release 1, .*Link sent by email$/)).toBeVisible()
    await expect(releases.getByRole('link', { name: 'Letter for release 1' })).toBeVisible()
    await expect(releases.getByText('Released in release 1')).toBeVisible()

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
