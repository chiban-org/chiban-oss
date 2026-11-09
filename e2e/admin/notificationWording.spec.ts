import type { E2eDb } from '../fixtures/db'
import { expect, test } from '../fixtures/test'
import { editorStatus, publishWithConfirm } from './support'

test.use({ role: 'admin' })

async function latest(db: E2eDb) {
  return await db.one<{ version: number; body: unknown }>(
    "select version, body from config_versions where kind = 'notification_wording' and status = 'published' union all select 0, null where not exists (select 1 from config_versions where kind = 'notification_wording' and status = 'published')",
  )
}

test('staff reword an email, preview it, put it into use and reset it', async ({
  page,
  db,
  suffix,
}) => {
  const before = await latest(db)
  await page.goto('/staff/settings/notification_wording')
  await page
    .getByRole('navigation', { name: 'Messages' })
    .getByRole('button', { name: /Fees due/ })
    .click()
  await page.getByLabel('Subject').fill(`Please pay {{fees.amount}} ${suffix}`)
  const preview = page.getByRole('region', { name: 'Preview' })
  await expect(preview).toContainText(`Please pay $125.00 ${suffix}`)
  await publishWithConfirm(page)
  await expect(editorStatus(page)).toHaveText(`Put version ${before.version + 1} into use.`)
  const published = await latest(db)
  expect(JSON.stringify(published.body)).toContain(`Please pay {{fees.amount}} ${suffix}`)

  await page
    .getByRole('navigation', { name: 'Messages' })
    .getByRole('button', { name: /Fees due/ })
    .click()
  await page.getByRole('button', { name: 'Reset to the standard wording' }).click()
  await expect(page.getByLabel('Subject')).toHaveValue(
    'Fees due for {{application.number}}: {{fees.amount}}',
  )
  await publishWithConfirm(page)
  await expect(editorStatus(page)).toHaveText(`Put version ${before.version + 2} into use.`)
  expect((await latest(db)).body).toEqual({ key: 'default', events: {} })
})

test('refuses a typed web address in the wording', async ({ page }) => {
  await page.goto('/staff/settings/notification_wording')
  await page.getByRole('textbox', { name: 'Message' }).fill('Pay at https://pay.example today.')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Leave web addresses out.', { exact: false }).first()).toBeVisible()
})
