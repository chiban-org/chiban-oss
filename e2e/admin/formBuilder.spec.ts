import { expect, test } from '../fixtures/test'
import {
  editorStatus,
  expectListedRefusal,
  publishWithConfirm,
  startDraft,
  versionsOf,
} from './support'

test.use({ role: 'admin' })

const KIND = 'form'

test.describe('form builder', () => {
  test('refuses an untitled question at publish and publishes once it is named', async ({
    page,
    db,
    suffix,
  }) => {
    const key = await startDraft(page, KIND, 'New form', `E2E form ${suffix}`)
    await page
      .getByRole('navigation', { name: 'Add a question' })
      .getByRole('button', { name: /^Add / })
      .first()
      .click()
    await publishWithConfirm(page)
    await expectListedRefusal(page, 'Replace the placeholder wording.')
    expect((await versionsOf(db, KIND, key)).map((v) => v.status)).toEqual(['draft'])
  })
})
