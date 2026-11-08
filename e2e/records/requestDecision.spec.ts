import { confirmDialog } from '../boards/confirm'
import { daysFromToday } from '../boards/records'
import { expect, test } from '../fixtures/test'
import {
  approveFound,
  expectToast,
  logRequestViaForm,
  openDetails,
  openRequest,
  recordTimeStatement,
  section,
  workCard,
} from './requestSupport'

test.use({ role: 'records' })

const DOCUMENT = 'Permit correspondence for the Birch Lane renovation'

test.describe('deciding a request after a time statement', () => {
  test('releases the records from the card and the request moves to responded', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Birch Lane decision, release ${suffix}`)
    await openRequest(page, id)
    await recordTimeStatement(page, await daysFromToday(db, 10), `Review first, ${suffix}`)
    await openRequest(page, id, DOCUMENT)
    await expect(workCard(page).getByRole('heading', { name: 'Release the records' })).toHaveCount(
      0,
    )
    await expect(workCard(page).getByText('Release the records', { exact: true })).toBeVisible()
    await approveFound(page, DOCUMENT)
    await workCard(page).getByRole('button', { name: 'Release 1 record' }).click()
    await confirmDialog(page, 'Release these records?')
      .getByRole('button', { name: 'Release the records' })
      .click()
    await expectToast(page, 'Records released.')
    await expect(page.getByText('Waiting on: Town. Close the request.')).toBeVisible()
    await expect(section(page, 'Releases').getByText(/^Release 1, /)).toBeVisible()
    const row = await db.one<{ status: string }>('select status from rtk_requests where id = $1', [
      id,
    ])
    expect(row.status).toBe('responded')
  })

  test('denies the request once a withheld record is on file and files the denial letter', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Mill Road decision, deny ${suffix}`)
    await openRequest(page, id)
    await recordTimeStatement(page, await daysFromToday(db, 10), `Counsel review, ${suffix}`)
    const card = workCard(page)
    await expect(card.getByText(/^Before a denial, record a withheld record/)).toBeVisible()

    const withheld = section(page, 'Records withheld or redacted')
    await openDetails(withheld, 'Record a withholding')
    await withheld.getByLabel('Which record').fill(`Email from counsel, ${suffix}`)
    await withheld.getByRole('combobox', { name: /^Exemption/ }).selectOption('nh.rtk.91a5.xii')
    await withheld
      .getByLabel('How the exemption applies (a sentence or two)')
      .fill('The email is a confidential communication seeking legal advice.')
    await withheld.getByRole('button', { name: 'Record withholding' }).click()
    await expectToast(page, 'Withholding recorded.')

    await openDetails(card, 'Deny the request')
    await card.getByRole('button', { name: 'Deny the request' }).click()
    const dialog = confirmDialog(page, /^Deny request RK-\d{4}-\d{4}\?$/)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Deny the request' }).click()
    await expectToast(page, 'Denial recorded and the letter filed.')
    await expect(page.getByText('Waiting on: Town. Close the request.')).toBeVisible()
    const row = await db.one<{ status: string; denied_on: string | null; letters: string }>(
      `select r.status, r.denied_on::text as denied_on,
         (select count(*)::text from documents d where d.record_id = r.id and d.title like 'Denial of request%') as letters
       from rtk_requests r where r.id = $1`,
      [id],
    )
    expect(row.status).toBe('responded')
    expect(row.denied_on).not.toBeNull()
    expect(row.letters).toBe('1')
  })
})
