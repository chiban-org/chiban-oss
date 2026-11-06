import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import {
  editorStatus,
  expectConfirmation,
  publishedVersion,
  publishWithConfirm,
  restoreVersion,
} from './support'

test.use({ role: 'admin' })

interface Case {
  title: string
  kind: string
  path: string
  field: (page: Page) => Locator
  value: (suffix: string) => string
  hasHistory: boolean
}

const text = (suffix: string) => `E2E ${suffix}`

const CASES: Case[] = [
  {
    title: 'payment settings',
    kind: 'payment_settings',
    path: '/staff/settings/payments',
    field: (page) => page.getByLabel('Receipt footer'),
    value: text,
    hasHistory: true,
  },
  {
    title: 'regional contacts',
    kind: 'regional_contacts',
    path: '/staff/settings/regional_contacts/default',
    field: (page) => page.getByLabel('Name').first(),
    value: text,
    hasHistory: true,
  },
  {
    title: 'review routes',
    kind: 'review_routes',
    path: '/staff/settings/review_routes/default',
    field: (page) => page.getByLabel('Department name').first(),
    value: text,
    hasHistory: true,
  },
  {
    title: 'board settings',
    kind: 'board_settings',
    path: '/staff/settings/board_settings/default',
    field: (page) => page.getByLabel('Newspaper of record').first(),
    value: text,
    hasHistory: true,
  },
  {
    title: 'inspection schedule',
    kind: 'inspection_settings',
    path: '/staff/settings/inspections',
    field: (page) => page.getByLabel('Phone line opens'),
    value: () => '07:45',
    hasHistory: false,
  },
]

for (const item of CASES) {
  test(`publishes ${item.title} and puts the earlier values back`, async ({ page, db, suffix }) => {
    const before = await publishedVersion(db, item.kind)
    await page.goto(item.path)
    const field = item.field(page)
    const original = await field.inputValue()
    await field.fill(item.value(suffix))
    await publishWithConfirm(page)
    await expect(editorStatus(page)).toHaveText(`Published version ${before.version + 1}.`)
    const published = await publishedVersion(db, item.kind)
    expect(published.version).toBe(before.version + 1)
    expect(published.body).not.toEqual(before.body)
    if (item.hasHistory) expect(JSON.stringify(published.body)).toContain(item.value(suffix))

    if (item.hasHistory) {
      await restoreVersion(page, before.version)
      await expectConfirmation(
        page,
        `Rolled back to version ${before.version} as version ${before.version + 2}.`,
      )
    } else {
      await field.fill(original)
      await publishWithConfirm(page)
      await expect(editorStatus(page)).toHaveText(`Published version ${before.version + 2}.`)
    }
    const restored = await publishedVersion(db, item.kind)
    expect(restored.version).toBe(before.version + 2)
    expect(restored.body).toEqual(before.body)
  })
}
