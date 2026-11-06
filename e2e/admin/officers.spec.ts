import { expect, fillDate, test } from '../fixtures/test'
import { expectConfirmation, expectRefusedBeside } from './support'

test.use({ role: 'admin' })

const OFFICER = 'Pat Planner'

test.describe('enforcement officer designations', () => {
  test('refuses an adoption date in 2099 beside the field and designates nobody', async ({
    page,
    db,
  }) => {
    const before = await db.rows('select 1 from enforcement_designations')
    await page.goto('/staff/admin/enforcement-officers')
    await page.getByRole('button', { name: 'Designate an officer' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Officer').selectOption({ label: OFFICER })
    const adopted = dialog.getByLabel('Date adopted')
    await fillDate(adopted, '2099-01-01')
    await dialog.getByRole('button', { name: 'Designate officer' }).click()
    await expectRefusedBeside(adopted, 'Date adopted')
    expect(await db.rows('select 1 from enforcement_designations')).toHaveLength(before.length)
  })

  test('designates an officer, then ends the designation after confirming', async ({
    page,
    db,
    suffix,
  }) => {
    await page.goto('/staff/admin/enforcement-officers')
    await page.getByRole('button', { name: 'Designate an officer' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Officer').selectOption({ label: OFFICER })
    await dialog.getByLabel('Designated by').fill(`Select Board ${suffix}`)
    await dialog.getByRole('button', { name: 'Designate officer' }).click()
    await expectConfirmation(page, 'Officer designated.')
    const row = await db.one<{ id: string; ended_on: string | null }>(
      'select id, ended_on from enforcement_designations where adopting_authority = $1',
      [`Select Board ${suffix}`],
    )
    expect(row.ended_on).toBeNull()

    await page.reload()
    const item = page.getByRole('listitem').filter({ hasText: `Select Board ${suffix}` })
    await expect(item).toContainText(`${OFFICER}, Code Enforcement Officer.`)
    await item.getByRole('button', { name: 'End this designation' }).click()
    const confirm = page.getByRole('dialog')
    await expect(
      confirm.getByRole('heading', { name: `End ${OFFICER}'s designation?` }),
    ).toBeVisible()
    await confirm.getByRole('button', { name: 'End the designation' }).click()
    await expectConfirmation(page, 'Designation ended.')
    const ended = await db.one<{ ended_on: string | null }>(
      'select ended_on from enforcement_designations where id = $1',
      [row.id],
    )
    expect(ended.ended_on).not.toBeNull()
  })

  test('edits the title of a designation and keeps it in force', async ({ page, db, suffix }) => {
    const authority = `Select Board ${suffix}`
    await page.goto('/staff/admin/enforcement-officers')
    await page.getByRole('button', { name: 'Designate an officer' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Officer').selectOption({ label: OFFICER })
    await dialog.getByLabel('Designated by').fill(authority)
    await dialog.getByRole('button', { name: 'Designate officer' }).click()
    await expectConfirmation(page, 'Officer designated.')

    await page.reload()
    const item = page.getByRole('listitem').filter({ hasText: authority })
    await item.getByRole('button', { name: `Edit ${OFFICER}'s designation` }).click()
    const edit = page.getByRole('dialog')
    const title = edit.getByLabel('Title')
    await expect(title).toHaveValue('Code Enforcement Officer')
    await title.fill(`Zoning Officer ${suffix}`)
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expectConfirmation(page, 'Designation saved.')
    const row = await db.one<{ title: string; ended_on: string | null }>(
      'select title, ended_on from enforcement_designations where adopting_authority = $1',
      [authority],
    )
    expect(row.title).toBe(`Zoning Officer ${suffix}`)
    expect(row.ended_on).toBeNull()

    await page.reload()
    const after = page.getByRole('listitem').filter({ hasText: authority })
    await expect(after).toContainText(`${OFFICER}, Zoning Officer ${suffix}.`)
    await after.getByRole('button', { name: 'End this designation' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'End the designation' }).click()
    await expectConfirmation(page, 'Designation ended.')
  })
})
