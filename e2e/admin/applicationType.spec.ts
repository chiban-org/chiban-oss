import { expect, test } from '../fixtures/test'
import {
  editorStatus,
  expectGroupRefused,
  publishWithConfirm,
  startDraft,
  versionsOf,
} from './support'

test.use({ role: 'admin' })

const KIND = 'application_type'

test.describe('application type and workflow editors', () => {
  test('refuses a type with no kind of proceeding at publish, then saves drafts and previews the workflow', async ({
    page,
    db,
    suffix,
  }) => {
    const key = await startDraft(page, KIND, 'New type', `E2E type ${suffix}`)
    await publishWithConfirm(page)
    await expectGroupRefused(page, 'classification', 'Choose')
    expect((await versionsOf(db, KIND, key)).map((v) => v.status)).toEqual(['draft'])

    await page.getByLabel('Kind of proceeding').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(editorStatus(page)).toHaveText('Draft saved.')
    const saved = await versionsOf(db, KIND, key)
    expect(saved[0]?.body.classification).toBeTruthy()

    await page.goto(`/staff/settings/workflow/${encodeURIComponent(key)}`)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(editorStatus(page)).toHaveText('Preview updated. Nothing was published.')
    await expect(page.getByRole('region', { name: 'Preview' })).toBeVisible()
    expect((await versionsOf(db, KIND, key)).map((v) => v.status)).toEqual(['draft'])

    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(editorStatus(page)).toHaveText('Draft saved.')
    await page.getByRole('button', { name: 'Discard draft' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Discard now' }).click()
    await expect(page).toHaveURL(`/staff/settings/${KIND}`)
    expect(await versionsOf(db, KIND, key)).toHaveLength(0)
  })
})
