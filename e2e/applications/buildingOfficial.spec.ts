import { formatCivilDate } from '@/lib/formatDate'
import { townToday } from '../boards/records'
import { expect, test } from '../fixtures/test'
import { passEveryItem } from './inspectionSupport'
import { doThisNow, openApplication } from './support'

const OFFICIAL_PERMIT = 'Demo permit: Workshop framing inspected by the building official'
const OFFICIAL_EMAIL = 'official@alderpond.example'

interface DueInspection {
  id: string
  scheduled_date: string
}

test.describe('the building official on a permit with their own inspection due', () => {
  test.use({ role: 'official' })

  test('opens the inspection from Do this now and records it on its page', async ({ page, db }) => {
    const due = await db.one<DueInspection>(
      `select i.id, i.scheduled_date::text
         from inspections i join users u on u.id = i.inspector_user_id
        where u.email = $1 and i.status = 'scheduled'`,
      [OFFICIAL_EMAIL],
    )
    const today = await townToday(db)
    expect(due.scheduled_date <= today).toBe(true)
    const day = due.scheduled_date === today ? 'Today' : formatCivilDate(due.scheduled_date)

    await openApplication(page, db, OFFICIAL_PERMIT)

    const card = doThisNow(page)
    await expect(card).toContainText('Framing inspection')
    await expect(card).toContainText(`${day} at 10:30 AM`)
    await expect(card.getByRole('radiogroup')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Fees and payments' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Requirements' })).toContainText(
      'Before it can be closed',
    )
    await expect(page.getByRole('region', { name: 'Next inspection' })).toHaveCount(0)

    await card.getByRole('link', { name: 'Record the result' }).click()
    await expect(page).toHaveURL(new RegExp(`/staff/inspections/${due.id}$`))
    const record = doThisNow(page)
    await passEveryItem(page)
    await record.getByLabel('Notes for the permit holder').fill('Framing is square and blocked.')
    await record.getByRole('button', { name: 'Record result' }).click()
    await page
      .getByRole('dialog', { name: 'Record the Framing inspection as passed?' })
      .getByRole('button', { name: 'Record as passed' })
      .click()

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Result recorded.' }),
    ).toBeVisible()
    const row = await db.one<{ status: string; result_notes: string }>(
      'select status, result_notes from inspections where id = $1',
      [due.id],
    )
    expect(row).toEqual({ status: 'passed', result_notes: 'Framing is square and blocked.' })
    await expect(page.getByRole('button', { name: 'Record result' })).toHaveCount(0)
  })
})
