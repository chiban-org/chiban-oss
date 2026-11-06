import { expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { logRequestViaForm, openDetails, openRequest, section } from './requestSupport'

test.use({ role: 'records' })

test.describe('recording a withholding', () => {
  test('stores the withholding and lists it with the exemption citation', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(
      page,
      db,
      `Attorney emails about the Mill Road culvert, ${suffix}`,
    )
    await openRequest(page, id)
    const withheld = section(page, 'Records withheld or redacted')
    await openDetails(withheld, 'Record a withholding')
    await withheld.getByLabel('Which record').fill(`Email from counsel, ${suffix}`)
    await withheld.getByRole('combobox', { name: /^Exemption/ }).selectOption('nh.rtk.91a5.xii')
    await withheld
      .getByLabel('How the exemption applies (a sentence or two)')
      .fill('The email is a confidential communication seeking legal advice.')
    await withheld.getByRole('button', { name: 'Record withholding' }).click()

    const item = withheld.getByRole('listitem').filter({ hasText: `Email from counsel, ${suffix}` })
    await expect(item.getByText(`Email from counsel, ${suffix} (Withheld in full)`)).toBeVisible()
    await expect(item.getByText('RSA 91-A:5 XII', { exact: false })).toBeVisible()
    const row = await db.one<{ scope: string; exemption_key: string }>(
      'select scope, exemption_key from rtk_withholdings where request_id = $1 and record_description = $2',
      [id, `Email from counsel, ${suffix}`],
    )
    expect(row).toEqual({ scope: 'withheld_in_full', exemption_key: 'nh.rtk.91a5.xii' })
  })

  test('refuses an explanation that is too short beside the field and stores nothing', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Personnel file request, ${suffix}`)
    await openRequest(page, id)
    const withheld = section(page, 'Records withheld or redacted')
    await openDetails(withheld, 'Record a withholding')
    await withheld.getByLabel('Which record').fill('Personnel evaluation')
    await withheld.getByRole('combobox', { name: /^Exemption/ }).selectOption('nh.rtk.91a5.xii')
    const explanation = withheld.getByLabel('How the exemption applies (a sentence or two)')
    await explanation.fill('Too short')
    await withheld.getByRole('button', { name: 'Record withholding' }).click()
    await expectRefusedBeside(explanation, 'Enter an explanation of at least 20 characters.')
    const rows = await db.rows('select 1 from rtk_withholdings where request_id = $1', [id])
    expect(rows).toHaveLength(0)
  })

  test('asks for the law when the exemption is another law', async ({ page, db, suffix }) => {
    const id = await logRequestViaForm(page, db, `Sealed adoption records, ${suffix}`)
    await openRequest(page, id)
    const withheld = section(page, 'Records withheld or redacted')
    await openDetails(withheld, 'Record a withholding')
    await withheld.getByLabel('Which record').fill('Sealed file')
    await withheld.getByRole('combobox', { name: /^Exemption/ }).selectOption('other_law')
    await withheld
      .getByLabel('How the exemption applies (a sentence or two)')
      .fill('The file is sealed by a court order and cannot be shown.')
    await withheld.getByRole('button', { name: 'Record withholding' }).click()
    await expectRefusedBeside(
      withheld.getByLabel('Law, if made confidential by another law'),
      'Enter the law that makes the record confidential.',
    )
    const rows = await db.rows('select 1 from rtk_withholdings where request_id = $1', [id])
    expect(rows).toHaveLength(0)
  })
})
