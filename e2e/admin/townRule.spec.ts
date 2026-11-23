import { expect, fillDate, test } from '../fixtures/test'
import { editorStatus, publishWithConfirm, versionsOf } from './support'

test.use({ role: 'admin' })

const KIND = 'town_rule_setting'
const KEY = 'town.bp.validity'

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
    await expect(page.getByText('A whole number from 1 to 120 months.')).toBeVisible()
    for (const bad of ['-3', '0', '121']) {
      await value.fill(bad)
      expect(
        await value.evaluate(
          (el: HTMLInputElement) => el.validity.rangeUnderflow || el.validity.rangeOverflow,
        ),
      ).toBe(true)
      expect(await value.evaluate((el: HTMLInputElement) => el.validationMessage)).not.toBe('')
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
