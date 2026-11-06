import { expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './support'

const DECK_NUMBER = 'BP-2025-0001'

async function openRequestForm(page: import('@playwright/test').Page) {
  await page.goto('/staff/inspections')
  const section = page.getByRole('region', { name: 'Take a request' })
  await section.getByLabel('Permit number').fill(DECK_NUMBER)
  await section.getByRole('button', { name: 'Find permit' }).click()
  await expect(section.getByRole('button', { name: 'Record request' })).toBeVisible()
  return section
}

test.describe('taking an inspection request at the counter', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses a missing contact name beside the field and records nothing', async ({
      page,
      db,
    }) => {
      const section = await openRequestForm(page)
      await section.getByRole('radio', { name: 'Footing inspection' }).click()
      await section.getByLabel('Contact name').fill('   ')
      await section.getByRole('button', { name: 'Record request' }).click()

      await expectRefusedBeside(section.getByLabel('Contact name'), 'Enter the contact name.')
      const rows = await db.rows<{ id: string }>(
        `select i.id from inspections i join applications a on a.id = i.application_id
          where a.number = $1 and i.inspection_type = 'footing' and i.contact_name = ''`,
        [DECK_NUMBER],
      )
      expect(rows).toHaveLength(0)
    })

    test('records a footing inspection request by phone and queues it', async ({
      page,
      db,
      suffix,
    }) => {
      const contact = `Dana Builder ${suffix}`
      const section = await openRequestForm(page)
      await section.getByRole('radio', { name: 'Footing inspection' }).click()
      await section.getByLabel('Contact name').fill(contact)
      await section.getByLabel('Contact phone').fill('603-555-0188')
      await section.getByRole('button', { name: 'Record request' }).click()

      await expect(
        page
          .getByRole('listbox', { name: 'Requests' })
          .getByRole('option')
          .filter({ hasText: `${DECK_NUMBER}, Footing` }),
      ).toHaveCount(1)
      const row = await db.one<{ status: string; channel: string; contact_phone: string }>(
        `select i.status, i.channel, i.contact_phone from inspections i
           join applications a on a.id = i.application_id
          where a.number = $1 and i.contact_name = $2`,
        [DECK_NUMBER, contact],
      )
      expect(row).toEqual({ status: 'requested', channel: 'phone', contact_phone: '603-555-0188' })
    })
  })

  test.describe('as the finance clerk', () => {
    test.use({ role: 'finance' })

    test('is refused the inspections page', async ({ page }) => {
      await page.goto('/staff/inspections')
      await expect(
        page.getByText('You do not have permission to schedule inspections.'),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Record request' })).toHaveCount(0)
    })
  })
})
