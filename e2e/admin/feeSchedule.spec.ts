import { expect, test } from '../fixtures/test'
import {
  editorStatus,
  expectGroupRefused,
  publishWithConfirm,
  startDraft,
  versionsOf,
} from './support'

test.use({ role: 'admin' })

const KIND = 'fee_schedule'

interface Line {
  label: string
  expr: { cents: number }
}

async function openNewSchedule(page: Parameters<typeof startDraft>[0], suffix: string) {
  return await startDraft(page, KIND, 'New fee schedule', `E2E fees ${suffix}`)
}

test.describe('fee schedule editor', () => {
  test('refuses a fee line named with only spaces and stores no published version', async ({
    page,
    db,
    suffix,
  }) => {
    const key = await openNewSchedule(page, suffix)
    await page.getByLabel('Name on the bill').fill('   ')
    await publishWithConfirm(page)
    await expectGroupRefused(
      page,
      'lines',
      'Fee 1: Enter the name of the fee as it shows on the bill.',
    )
    expect((await versionsOf(db, KIND, key)).map((v) => v.status)).toEqual(['draft'])
  })

  test('refuses an amount over $1,000,000 and publishes $1,000,000 exactly', async ({
    page,
    db,
    suffix,
  }) => {
    const key = await openNewSchedule(page, suffix)
    await page.getByLabel('Name on the bill').fill(`Review fee ${suffix}`)
    await page.getByRole('spinbutton', { name: 'Amount' }).fill('1000001')
    await publishWithConfirm(page)
    await expectGroupRefused(page, 'lines', 'Fee 1: Enter an amount of $1,000,000.00 or less.')
    expect((await versionsOf(db, KIND, key)).map((v) => v.status)).toEqual(['draft'])

    await page.getByRole('spinbutton', { name: 'Amount' }).fill('1000000')
    await publishWithConfirm(page)
    await expect(editorStatus(page)).toHaveText('Put version 1 into use.')
    const rows = await versionsOf(db, KIND, key)
    expect(rows.map((v) => v.status)).toEqual(['published'])
    const line = (rows[0]?.body.lines as Line[])[0]
    expect(line?.label).toBe(`Review fee ${suffix}`)
    expect(line?.expr.cents).toBe(100_000_000)
  })
})
