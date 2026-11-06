import { type E2eDb, expect, test } from '../fixtures/test'

test.use({ role: 'records' })

const DOCUMENT = 'Demo letter with a private phone number'

async function originalVersion(db: E2eDb): Promise<string> {
  const row = await db.one<{ id: string }>(
    `select v.id from document_versions v join documents d on d.id = v.document_id
     where d.title = $1 and v.role = 'original'`,
    [DOCUMENT],
  )
  return row.id
}

async function redactedCopies(db: E2eDb): Promise<number> {
  const row = await db.one<{ n: string }>(
    `select count(*) as n from document_versions v join documents d on d.id = v.document_id
     where d.title = $1 and v.role = 'public_redacted'`,
    [DOCUMENT],
  )
  return Number(row.n)
}

test.describe('redacting a document', () => {
  test('refuses a save with no box drawn and makes no copy', async ({ page, db }) => {
    const before = await redactedCopies(db)
    await page.goto(`/staff/records/redact/${await originalVersion(db)}`)
    await expect(page.getByRole('button', { name: 'Add a box to page 1' })).toBeVisible()
    await page.getByRole('button', { name: 'Make the redacted copy' }).click()
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Draw at least one box.',
    )
    expect(await redactedCopies(db)).toBe(before)
  })

  test('refuses a box with no exemption and makes no copy', async ({ page, db }) => {
    const before = await redactedCopies(db)
    await page.goto(`/staff/records/redact/${await originalVersion(db)}`)
    await page.getByRole('button', { name: 'Add a box to page 1' }).click()
    await page.getByRole('button', { name: 'Make the redacted copy' }).click()
    await expect(page.locator('ul[role="alert"]')).toContainText(
      'Box 1 on page 1: choose an exemption.',
    )
    expect(await redactedCopies(db)).toBe(before)
  })

  test('saves a box with an exemption and explanation as a new redacted copy', async ({
    page,
    db,
  }) => {
    const before = await redactedCopies(db)
    await page.goto(`/staff/records/redact/${await originalVersion(db)}`)
    await page.getByRole('button', { name: 'Add a box to page 1' }).click()
    await page.getByRole('combobox', { name: /^Exemption/ }).selectOption('nh.rtk.91a5.iv')
    await page
      .getByLabel('How the exemption applies')
      .fill('A private telephone number is personal information.')
    await page.getByRole('button', { name: 'Make the redacted copy' }).click()
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Redacted copy made.' }),
    ).toBeVisible({ timeout: 60_000 })
    expect(await redactedCopies(db)).toBe(before + 1)
  })
})

test.describe('redaction as a finance user', () => {
  test.use({ role: 'finance' })

  test('cannot open the redaction page', async ({ page, db }) => {
    await page.goto(`/staff/records/redact/${await originalVersion(db)}`)
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to redact documents.',
    )
    await expect(page.getByRole('button', { name: 'Make the redacted copy' })).toHaveCount(0)
  })
})
