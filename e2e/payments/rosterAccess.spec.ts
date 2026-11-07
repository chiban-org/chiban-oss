import type { Locator } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import { openDialog, openRoster } from './rosterSupport'
import { confirmWith, expectConfirmation, expectRefusedBeside } from './support'

const DAYS = /^Days between checks/
const VIEWPORT = { width: 1280, height: 800 }

async function expectNotClipped(button: Locator, container: Locator): Promise<void> {
  const clipped = await button.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(clipped).toBe(false)
  const box = await button.boundingBox()
  const bounds = await container.boundingBox()
  if (box === null || bounds === null) throw new Error('roster action has no layout box')
  expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(
    Math.min(bounds.x + bounds.width, VIEWPORT.width) + 1,
  )
}

test.describe('the notice roster by role', () => {
  test.describe('as inspector', () => {
    test.use({ role: 'inspector' })

    test('the roster refuses and offers no forms', async ({ page }) => {
      await page.goto('/staff/notice-contacts')
      await expect(
        page.getByText('You do not have permission to keep the notice contacts.'),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add association', exact: true })).toHaveCount(
        0,
      )
      await expect(page.getByRole('button', { name: 'Record a check' })).toHaveCount(0)
    })
  })

  test.describe('as staff', () => {
    test.use({ role: 'staff', viewport: VIEWPORT })

    test('cannot change the recheck interval', async ({ page }) => {
      await openRoster(page)
      await expect(page.getByText(/^Contacts are due for a check every/)).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Change how often contacts are due for a check' }),
      ).toHaveCount(0)
    })

    test('roster action buttons are fully visible at 1280 px', async ({ page }) => {
      await openRoster(page)
      const groups = page.locator('.row-actions')
      expect(await groups.count()).toBeGreaterThan(0)
      for (const group of await groups.all()) {
        for (const button of await group.getByRole('button').all()) {
          await expect(button).toBeVisible()
          await expectNotClipped(button, group)
        }
      }
    })
  })

  test.describe
    .serial('as admin', () => {
      test.use({ role: 'admin' })
      const change = 'Change how often contacts are due for a check'

      test('refuses an interval of zero days beside the field', async ({ page }) => {
        await openRoster(page)
        const dialog = await openDialog(page, change, 'How often contacts are checked')
        await dialog.getByLabel(DAYS).fill('0')
        await dialog.getByRole('button', { name: 'Put into use' }).click()
        await expectRefusedBeside(dialog.getByLabel(DAYS), 'Check: Days between checks.')
        await expect(page.getByRole('dialog', { name: 'Put these changes into use?' })).toHaveCount(
          0,
        )
      })

      test('publishes a new interval after the dialog and shows it on the roster', async ({
        page,
        db,
      }) => {
        await openRoster(page)
        const dialog = await openDialog(page, change, 'How often contacts are checked')
        await dialog.getByLabel(DAYS).fill('400')
        await dialog.getByRole('button', { name: 'Put into use' }).click()
        await confirmWith(page, 'Put these changes into use?', 'Put into use now')
        await expectConfirmation(page, 'Contacts are now due every 400 days.')
        await expect(page.getByText('Contacts are due for a check every 400 days.')).toBeVisible()
        const row = await db.one<{ body: unknown }>(
          `select body from config_versions where kind = 'board_settings' and status = 'published' order by published_at desc limit 1`,
        )
        expect(JSON.stringify(row.body)).toContain('400')
      })
    })
})
