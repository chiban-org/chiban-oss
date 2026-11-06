import { expect, fillDate, test } from '../fixtures/test'
import {
  editorStatus,
  expectListedRefusal,
  publishWithConfirm,
  startDraft,
  versionsOf,
} from './support'

test.use({ role: 'admin' })

const KIND = 'local_code_amendment'

test.describe('local code amendment editor', () => {
  test('refuses the starter placeholders at publish, then publishes the real record', async ({
    page,
    db,
    suffix,
  }) => {
    const title = `E2E amendment ${suffix}`
    const key = await startDraft(page, KIND, 'New amendment', title)
    await publishWithConfirm(page)
    await expectListedRefusal(page, 'Enter the code section this change amends.')
    await expectListedRefusal(page, 'Enter who adopted this change.')
    await expectListedRefusal(page, 'Enter the date it was adopted.')
    expect((await versionsOf(db, KIND, key)).map((v) => v.status)).toEqual(['draft'])

    await page.getByLabel('Code section').fill('IRC R301.2')
    await page.getByLabel('Adopted by').fill('Town Meeting')
    await fillDate(page.getByLabel('Adopted on'), '2025-03-11')
    await publishWithConfirm(page)
    await expect(editorStatus(page)).toHaveText('Published version 1.')
    const rows = await versionsOf(db, KIND, key)
    expect(rows.map((v) => v.status)).toEqual(['published'])
    expect(rows[0]?.body).toMatchObject({
      title,
      codeSection: 'IRC R301.2',
      adoptingAuthority: 'Town Meeting',
      adoptedOn: '2025-03-11',
    })
  })
})
