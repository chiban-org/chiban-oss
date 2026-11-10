import type { Page } from '@playwright/test'
import { type E2eDb, expect, test } from '../fixtures/test'
import { expectConfirmation, expectRefusedBeside } from './support'

const LAUNDRY_SINK_PARCEL = '007023000000'

async function openLaundrySink(page: Page, db: E2eDb): Promise<string> {
  const row = await db.one<{ id: string }>(
    `select a.id from applications a
       join projects p on p.id = a.project_id
       join parcel_aliases pa on pa.parcel_id = p.parcel_id
      where pa.value = $1 and a.application_type_key = 'PL'`,
    [LAUNDRY_SINK_PARCEL],
  )
  await page.goto(`/staff/applications/${row.id}`)
  await expect(page.locator('main:not([aria-busy])')).toBeVisible()
  return row.id
}

async function revisionOf(db: E2eDb, id: string): Promise<number> {
  const row = await db.one<{ permit_revision: number }>(
    'select permit_revision from applications where id = $1',
    [id],
  )
  return row.permit_revision
}

test.describe('correcting an issued permit', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses a blank reason beside the field and never opens the confirm', async ({
      page,
      db,
    }) => {
      const id = await openLaundrySink(page, db)
      const before = await revisionOf(db, id)
      await page.getByRole('button', { name: 'Correct this permit' }).click()
      const dialog = page.getByRole('dialog', { name: /^Correct permit / })
      await dialog.getByLabel('Reason for the correction').fill('   ')
      await dialog.getByRole('button', { name: /^Save and reissue as revision / }).click()

      await expectRefusedBeside(
        dialog.getByLabel('Reason for the correction'),
        'Enter the reason for the correction.',
      )
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await expect(page.getByRole('dialog', { name: /^Reissue permit / })).toHaveCount(0)
      expect(await revisionOf(db, id)).toBe(before)
    })

    test('reissues the permit as the next revision with the corrected title', async ({
      page,
      db,
      suffix,
    }) => {
      const id = await openLaundrySink(page, db)
      const before = await revisionOf(db, id)
      const title = `Laundry sink, corrected ${suffix}`
      await page.getByRole('button', { name: 'Correct this permit' }).click()
      const dialog = page.getByRole('dialog', { name: /^Correct permit / })
      await dialog.getByLabel('Project title').fill(title)
      await dialog
        .getByLabel('Reason for the correction')
        .fill(`Title typed wrong at the counter ${suffix}`)
      await dialog.getByRole('button', { name: /^Save and reissue as revision / }).click()
      const confirm = page.getByRole('dialog', {
        name: new RegExp(`^Reissue permit .* as revision ${before + 1}\\?$`),
      })
      await confirm
        .getByRole('button', { name: `Save and reissue as revision ${before + 1}` })
        .click()

      await expectConfirmation(page, `Permit reissued as revision ${before + 1}.`)
      await expect.poll(() => revisionOf(db, id)).toBe(before + 1)
      const row = await db.one<{ permit_revision: number; title: string }>(
        'select a.permit_revision, p.title from applications a join projects p on p.id = a.project_id where a.id = $1',
        [id],
      )
      expect(row).toEqual({ permit_revision: before + 1, title })
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is not offered the correction', async ({ page, db }) => {
      await openLaundrySink(page, db)
      await expect(page.getByRole('button', { name: 'Correct this permit' })).toHaveCount(0)
    })
  })
})
