import { confirmDialog } from '../boards/confirm'
import { daysFromToday, townToday } from '../boards/records'
import { accountFor, expect, fillDate, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { expectToast, openDetails } from './requestSupport'

test.use({ role: 'records' })

test.describe('retention events', () => {
  test('refuses a future date beside the field, then records the appeal period', async ({
    page,
    db,
  }) => {
    await page.goto('/staff/records/retention?state=awaiting_event')
    const row = page.getByRole('row').filter({ hasText: 'Open complaint photo log' })
    await openDetails(row, 'Record event')
    const date = row.getByLabel('Date it happened')
    await fillDate(date, await daysFromToday(db, 30))
    await row.getByRole('button', { name: 'Record event' }).click()
    await expectRefusedBeside(date, 'Enter the date it happened between')
    const before = await db.rows(
      "select 1 from record_events where kind = 'appeal_period_expired' and occurred_on > $1",
      [await townToday(db)],
    )
    expect(before).toHaveLength(0)

    await fillDate(date, await townToday(db))
    await row.getByRole('button', { name: 'Record event' }).click()
    await expectToast(page, 'Event recorded. The retention clock now runs from that date.')
    const stored = await db.one<{ kind: string; occurred_on: string }>(
      `select e.kind, e.occurred_on::text from record_events e
       join documents d on d.record_id = e.case_id and d.record_kind = 'enforcement_case'
       where d.title = 'Open complaint photo log'`,
    )
    expect(stored).toEqual({ kind: 'appeal_period_expired', occurred_on: await townToday(db) })
  })
})

test.describe('disposition batches', () => {
  test('refuses a date with nothing eligible beside the field, proposes a batch, then cancels it after confirming', async ({
    page,
    db,
  }) => {
    await page.goto('/staff/records/retention')
    const section = page.getByRole('region', { name: 'Disposition batches' })
    await openDetails(section, 'Propose a batch')
    const asOf = section.getByLabel('Records eligible on or before')
    await fillDate(asOf, '2001-01-01')
    await section.getByRole('button', { name: 'Propose batch' }).click()
    await expectRefusedBeside(asOf, 'No records are eligible on that date.')

    await fillDate(asOf, await townToday(db))
    await section.getByRole('button', { name: 'Propose batch' }).click()
    await expectToast(
      page,
      'Batch proposed. A records custodian has to approve it before anything is disposed of.',
    )
    const batch = await db.one<{ id: string; status: string }>(
      `select id, status from disposition_batches
       where proposed_by = $1 and status = 'proposed'`,
      [await db.userIdFor(accountFor('records').email)],
    )
    await page.goto(`/staff/records/disposition/${batch.id}`)
    const rail = page.getByRole('complementary')
    await openDetails(rail, 'Cancel the batch')
    await rail.getByRole('button', { name: 'Cancel batch' }).click()
    const dialog = confirmDialog(page, 'Cancel this disposition batch?')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep the batch' }).click()
    await expect(dialog).toHaveCount(0)
    const kept = await db.one<{ status: string }>(
      'select status from disposition_batches where id = $1',
      [batch.id],
    )
    expect(kept.status).toBe('proposed')

    await rail.getByRole('button', { name: 'Cancel batch' }).click()
    await dialog.getByRole('button', { name: 'Cancel the batch' }).click()
    await expectToast(page, 'Batch cancelled.')
    const cancelled = await db.one<{ status: string }>(
      'select status from disposition_batches where id = $1',
      [batch.id],
    )
    expect(cancelled.status).toBe('cancelled')
  })
})

test.describe('retention as a finance user', () => {
  test.use({ role: 'finance' })

  test('cannot see the batch form and the retention URL refuses', async ({ page }) => {
    await page.goto('/staff/records/retention')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to see the retention worklist.',
    )
    await expect(page.getByText('Propose a batch')).toHaveCount(0)
  })
})
