import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import { solidPng } from './png'
import { expectConfirmation, publishedVersion, restoreVersion } from './support'

test.use({ role: 'admin' })

const KIND = 'town_profile'

async function publishSection(page: Page, expectedVersion: number): Promise<void> {
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
    `Published version ${expectedVersion}.`,
  )
}

async function restoreEarlier(page: Page, from: number, previous: number): Promise<void> {
  await restoreVersion(page, previous)
  await expectConfirmation(page, `Rolled back to version ${previous} as version ${from + 1}.`)
}

function objectKeyOf(body: Record<string, unknown>, field: string): string {
  const image = (body[field] ?? null) as { objectKey: string } | null
  if (image === null) throw new Error(`published town profile has no ${field}`)
  return image.objectKey
}

test.describe('town profile, letterhead and signers', () => {
  test('publishes office hours with a real logo upload to storage, then restores', async ({
    page,
    db,
    suffix,
  }) => {
    const before = await publishedVersion(db, KIND)
    const hours = `Weekdays 9 to 3, ${suffix}`
    await page.goto('/staff/settings/town-profile')
    await page.getByLabel('Office hours').fill(hours)
    const preview = page.getByAltText('Town logo or seal as uploaded')
    const seededSrc = await preview.getAttribute('src')
    await page.getByLabel('Town logo or seal').setInputFiles({
      name: 'seal.png',
      mimeType: 'image/png',
      buffer: solidPng(16, [20, 90, 160]),
    })
    await expect(preview).not.toHaveAttribute('src', seededSrc ?? '')
    await publishSection(page, before.version + 1)
    const published = await publishedVersion(db, KIND)
    expect(JSON.stringify(published.body)).toContain(hours)
    const logo = objectKeyOf(published.body, 'logo')
    expect(logo).not.toBe(objectKeyOf(before.body, 'logo'))
    const served = await page.request.get(`/staff/settings/town-assets/${logo.split('/').at(-1)}`)
    expect(served.status()).toBe(200)
    expect(served.headers()['content-type']).toContain('image/png')

    await page.reload()
    await restoreEarlier(page, before.version + 1, before.version)
    expect((await publishedVersion(db, KIND)).body).toEqual(before.body)
  })

  test('refuses an office name of only spaces beside the field and keeps the published version', async ({
    page,
    db,
  }) => {
    const before = await publishedVersion(db, KIND)
    await page.goto('/staff/settings/town-profile')
    const office = page.getByLabel('Office name')
    await office.fill('   ')
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /Enter the office name/ })
        .first(),
    ).toBeVisible()
    expect((await publishedVersion(db, KIND)).version).toBe(before.version)
  })

  test('publishes a signature upload for the signer without one, then restores', async ({
    page,
    db,
  }) => {
    const before = await publishedVersion(db, KIND)
    await page.goto('/staff/settings/signers')
    await page.getByLabel('Signature for Robin Vale').setInputFiles({
      name: 'signature.png',
      mimeType: 'image/png',
      buffer: solidPng(16, [10, 10, 10]),
    })
    await expect(page.getByAltText('Signature for Robin Vale as uploaded')).toBeVisible()
    await publishSection(page, before.version + 1)
    const published = await publishedVersion(db, KIND)
    expect(published.body).not.toEqual(before.body)
    const signers = published.body.signers as { name: string; signature?: { objectKey: string } }[]
    const signed = signers.find((s) => s.name === 'Robin Vale')
    expect(signed?.signature?.objectKey).toBeTruthy()
    const served = await page.request.get(
      `/staff/settings/town-assets/${signed?.signature?.objectKey.split('/').at(-1)}`,
    )
    expect(served.status()).toBe(200)

    await page.reload()
    await restoreEarlier(page, before.version + 1, before.version)
    expect((await publishedVersion(db, KIND)).body).toEqual(before.body)
  })

  test('publishes the letterhead footer, then restores', async ({ page, db, suffix }) => {
    const before = await publishedVersion(db, KIND)
    const footer = `Printed by the Land Use Office, ${suffix}`
    await page.goto('/staff/settings/letterhead')
    await page.getByLabel('Footer text', { exact: true }).fill(footer)
    await publishSection(page, before.version + 1)
    expect(JSON.stringify((await publishedVersion(db, KIND)).body)).toContain(footer)

    await page.reload()
    await restoreEarlier(page, before.version + 1, before.version)
    expect((await publishedVersion(db, KIND)).body).toEqual(before.body)
  })
})
