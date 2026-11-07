import { expect, test } from '../fixtures/test'
import {
  editorStatus,
  expectConfirmation,
  publishWithConfirm,
  startDraft,
  versionsOf,
} from './support'

test.use({ role: 'admin' })

const KIND = 'condition_library'

function conditionText(row: { body: Record<string, unknown> } | undefined): unknown {
  const conditions = row?.body.conditions as { text: string }[] | undefined
  return conditions?.[0]?.text
}

test.describe('the draft, publish, restore and discard bar on a conditions set', () => {
  test('saves a draft, publishes twice, restores version 1 and discards a later draft', async ({
    page,
    db,
    suffix,
  }) => {
    const key = await startDraft(
      page,
      KIND,
      'New set of conditions',
      `E2E bar conditions ${suffix}`,
    )
    const first = `Keep the silt fence up until grass takes, ${suffix} one`
    const second = `Keep the silt fence up until grass takes, ${suffix} two`
    const condition = page.getByLabel('Condition 1')

    await condition.fill(first)
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(editorStatus(page)).toHaveText('Draft saved.')
    const saved = await versionsOf(db, KIND, key)
    expect(saved.map((v) => v.status)).toEqual(['draft'])
    expect(conditionText(saved[0])).toBe(first)

    await page.getByRole('button', { name: 'Put into use', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Put these changes into use?' })).toBeVisible()
    await expect(dialog).toContainText('You can restore an earlier version')
    await dialog.getByRole('button', { name: 'Keep editing' }).click()
    await expect(dialog).toHaveCount(0)
    expect((await versionsOf(db, KIND, key)).map((v) => v.status)).toEqual(['draft'])

    await publishWithConfirm(page)
    await expect(editorStatus(page)).toHaveText('Put version 1 into use.')
    expect((await versionsOf(db, KIND, key)).map((v) => v.status)).toEqual(['published'])

    await condition.fill(second)
    await publishWithConfirm(page)
    await expect(editorStatus(page)).toHaveText('Put version 2 into use.')
    const twice = await versionsOf(db, KIND, key)
    expect(twice.map((v) => v.status)).toEqual(['superseded', 'published'])
    expect(conditionText(twice[1])).toBe(second)

    await page.getByRole('button', { name: 'Restore version 1', exact: true }).click()
    const restore = page.getByRole('dialog')
    await expect(restore.getByRole('heading', { name: 'Restore version 1?' })).toBeVisible()
    await expect(restore).toContainText('goes live at once')
    await restore.getByRole('button', { name: 'Restore version 1', exact: true }).click()
    await expectConfirmation(page, 'Rolled back to version 1 as version 3.')
    const restored = await versionsOf(db, KIND, key)
    expect(restored.map((v) => v.status)).toEqual(['superseded', 'superseded', 'published'])
    expect(conditionText(restored[2])).toBe(first)

    await condition.fill(`${second} draft only`)
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(editorStatus(page)).toHaveText('Draft saved.')
    await page.getByRole('button', { name: 'Discard draft' }).click()
    const discard = page.getByRole('dialog')
    await expect(discard.getByRole('heading', { name: 'Discard this draft?' })).toBeVisible()
    await expect(discard).toContainText('The version in use stays in use.')
    await discard.getByRole('button', { name: 'Discard now' }).click()
    await expect(editorStatus(page)).toHaveText('Draft discarded.')
    const after = await versionsOf(db, KIND, key)
    expect(after.map((v) => v.status)).toEqual(['superseded', 'superseded', 'published'])
  })
})
