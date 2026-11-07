import { expect, fillDate, test } from '../fixtures/test'
import { editorStatus, expectGroupRefused, publishWithConfirm, versionsOf } from './support'

test.use({ role: 'admin' })

const KIND = 'town_rule_setting'
const KEY = 'town.bp.validity'
const BOUNDS = 'Enter a whole number of months from 1 to 120.'

test.describe('town rule setting for the building permit validity period', () => {
  test('refuses -3 and 0 beside the value and publishes 12 with its adoption record', async ({
    page,
    db,
  }) => {
    await page.goto('/staff/settings/town_rule_setting')
    await page.getByRole('button', { name: 'Set a town rule', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Rule').selectOption({ label: 'Building permit validity period' })
    await dialog.getByRole('button', { name: 'Start a draft' }).click()
    await expect(page).toHaveURL(`/staff/settings/${KIND}/${KEY}`)

    const value = page.getByLabel('Value, in months')
    for (const bad of ['-3', '0']) {
      await value.fill(bad)
      await publishWithConfirm(page)
      await expectGroupRefused(page, 'value', BOUNDS)
    }
    expect((await versionsOf(db, KIND, KEY)).map((v) => v.status)).toEqual(['draft'])

    await value.fill('12')
    await page.getByLabel('Adopted by').fill('Town Meeting')
    await fillDate(page.getByLabel('Adopted on'), '2025-03-11')
    await publishWithConfirm(page)
    await expect(editorStatus(page)).toHaveText('Put version 1 into use.')
    const rows = await versionsOf(db, KIND, KEY)
    expect(rows.map((v) => v.status)).toEqual(['published'])
    expect(rows[0]?.body).toMatchObject({
      ruleKey: KEY,
      value: 12,
      adoptingAuthority: 'Town Meeting',
    })
  })
})
