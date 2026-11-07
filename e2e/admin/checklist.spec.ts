import { expect, test } from '../fixtures/test'
import { editorStatus, publishWithConfirm, startDraft, versionsOf } from './support'

test.use({ role: 'admin' })

const KIND = 'inspection_checklist'

test.describe('inspection checklist editor', () => {
  test('publishes a checklist with the check the clerk wrote', async ({ page, db, suffix }) => {
    const key = await startDraft(page, KIND, 'New checklist', `E2E checklist ${suffix}`)
    const check = `Smoke alarm within 10 feet of each bedroom, ${suffix}`
    await page.getByLabel('Check 1').fill(check)
    await publishWithConfirm(page)
    await expect(editorStatus(page)).toHaveText('Put version 1 into use.')
    const rows = await versionsOf(db, KIND, key)
    expect(rows.map((v) => v.status)).toEqual(['published'])
    const items = rows[0]?.body.items as { label: string }[]
    expect(items.map((i) => i.label)).toEqual([check])
  })
})
