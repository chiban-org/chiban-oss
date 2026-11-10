import type { Page } from '@playwright/test'
import { daysFromToday, townToday } from '../boards/records'
import { openRecordHistory } from '../fixtures/recordHistory'
import { type E2eDb, expect, fillDate, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { expectToast, openDetails } from './requestSupport'

const APPLICATION = 'Demo permit: Barn conversion under appeal'

async function openRecordsPanel(page: Page, db: E2eDb) {
  const row = await db.one<{ id: string }>(
    'select a.id from applications a join projects p on p.id = a.project_id where p.title = $1',
    [APPLICATION],
  )
  await page.goto(`/staff/applications/${row.id}`)
  await expect(page.locator('main:not([aria-busy])')).toBeVisible()
  await openRecordHistory(page)
  const panel = page.getByRole('region', { name: 'Records' })
  await expect(panel).toBeVisible()
  return { panel, applicationId: row.id }
}

test.describe('records panel on an application as the records custodian', () => {
  test.use({ role: 'records' })

  test('refuses a short reason beside the field, then places the hold on the application', async ({
    page,
    db,
    suffix,
  }) => {
    const { panel, applicationId } = await openRecordsPanel(page, db)
    await openDetails(panel, 'Place a legal hold')
    const reason = panel.getByLabel('Reason (at least 10 characters)')
    await reason.fill('short')
    await panel.getByRole('button', { name: 'Place hold on this application' }).click()
    await expectRefusedBeside(reason, 'Enter a reason of at least 10 characters.')

    const text = `Hold while the abutter appeal is heard, ${suffix}`
    await reason.fill(text)
    await panel.getByRole('button', { name: 'Place hold on this application' }).click()
    await expectToast(page, 'Legal hold placed.')
    const hold = await db.one<{ target_kind: string; target_id: string }>(
      'select target_kind, target_id from legal_holds where reason = $1',
      [text],
    )
    expect(hold).toEqual({ target_kind: 'application', target_id: applicationId })
    await page.reload()
    await openRecordHistory(page)
    await expect(
      page.getByRole('region', { name: 'Records' }).getByText(`application hold: ${text}`),
    ).toBeVisible()
  })
})

test.describe('records panel on an application as the clerk', () => {
  test.use({ role: 'staff' })

  test('refuses a future removal date beside the field, then records the removal', async ({
    page,
    db,
  }) => {
    const { panel } = await openRecordsPanel(page, db)
    await expect(panel.getByText('Place a legal hold')).toHaveCount(0)
    await openDetails(panel, 'Record the building removed')
    const date = panel.getByLabel('Date the building was removed')
    await fillDate(date, await daysFromToday(db, 30))
    await panel.getByRole('button', { name: 'Record building removed' }).click()
    await expectRefusedBeside(date, 'Enter the date the building was removed between')

    const today = await townToday(db)
    await fillDate(date, today)
    await panel.getByRole('button', { name: 'Record building removed' }).click()
    await expectToast(page, 'Removal recorded.')
    const events = await db.rows(
      "select 1 from record_events where kind = 'building_removed' and occurred_on = $1",
      [today],
    )
    expect(events.length).toBeGreaterThan(0)
  })
})
