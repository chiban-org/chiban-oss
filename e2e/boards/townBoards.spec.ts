import { expect, test } from '../fixtures/test'
import { confirmWith } from './confirm'
import { daysFromToday } from './records'

const SHORT_NAME = 'Conservation Commission'

function longDate(civil: string): string {
  return new Date(`${civil}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

test.describe
  .serial('a conservation commission added in Settings, Boards', () => {
    let name: string
    let meetingDate: string
    let location: string
    let meetingId: string

    test('adds the board from the list of kinds', async ({ pageAs, suffix }) => {
      name = `Shoreland Conservation Commission ${suffix}`
      const page = await pageAs('admin')
      await page.goto('/staff/settings/boards')
      await expect(page.getByRole('heading', { name: 'Boards', level: 1 })).toBeVisible()
      await page.getByRole('button', { name: 'Add a board' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a board' })
      await expect(dialog.getByRole('radio', { name: /^Planning Board/ })).toBeDisabled()
      await expect(dialog.getByText(/already has an active Planning Board/)).toBeVisible()
      await dialog.getByRole('radio', { name: /^Conservation Commission/ }).click()
      await expect(dialog.getByLabel(/^Short name/)).toHaveValue(SHORT_NAME)
      await dialog.getByLabel(/^Name/).first().fill(name)
      await dialog.getByRole('button', { name: 'Add board' }).click()
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toBeVisible()
      await expect(row.getByText('Active', { exact: true })).toBeVisible()
      await expect(row.getByText('None scheduled')).toBeVisible()
    })

    test('schedules its meeting and shows its agenda', async ({ pageAs, db, suffix }) => {
      meetingDate = await daysFromToday(db, 900)
      location = `Conservation room ${suffix}`
      const page = await pageAs('staff')
      await page.goto('/staff/boards/meetings')
      await page.getByRole('button', { name: 'Add meeting' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a meeting' })
      await dialog.getByLabel('Board').selectOption({ label: name })
      await dialog.getByLabel('Date').fill(meetingDate)
      await dialog.getByLabel('Kind').selectOption('regular')
      await dialog.getByLabel('Location').fill(location)
      await dialog.getByRole('button', { name: 'Add meeting' }).click()
      await expect(dialog.getByRole('status')).toHaveText('Meeting added to the calendar.')
      const row = await db.one<{ id: string }>(
        'select m.id from board_meetings m join boards b on b.id = m.board_id where b.name = $1 and m.location = $2',
        [name, location],
      )
      meetingId = row.id
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      await page.getByLabel(/^Title/).fill('Trail easement update')
      await page.getByRole('button', { name: 'Add the first agenda item' }).click()
      await expect(
        page.getByRole('region', { name: 'Agenda' }).getByText('Trail easement update'),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Show the agenda on the public site' }).click()
      await expect(page.getByText(/^Shown on the public site on /)).toBeVisible()
    })

    test('lists the agenda on the public meetings page for a signed-out visitor', async ({
      pageAs,
    }) => {
      const page = await pageAs('anonymous')
      await page.goto('/meetings')
      await expect(
        page.getByRole('link', { name: `Agenda: ${SHORT_NAME}, ${longDate(meetingDate)}` }),
      ).toBeVisible()
    })

    test('refuses to archive while the meeting is ahead, and says why before the confirmation', async ({
      pageAs,
      db,
    }) => {
      const page = await pageAs('admin')
      await page.goto('/staff/settings/boards')
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row.getByText(longDate(meetingDate))).toBeVisible()
      await row.getByRole('button', { name: `Archive ${name}` }).click()
      await expect(row.getByRole('status')).toContainText(
        `${name} cannot be archived yet. It has 1 scheduled meeting ahead. Cancel it first.`,
      )
      await expect(page.getByRole('dialog', { name: /^Archive/ })).toHaveCount(0)
      const stored = await db.one<{ archived: boolean }>(
        'select archived_at is not null as archived from boards where name = $1',
        [name],
      )
      expect(stored.archived).toBe(false)
    })

    test('archives once the meeting is cancelled, and the board leaves the pickers but keeps its agenda', async ({
      pageAs,
      db,
    }) => {
      const staff = await pageAs('staff')
      await staff.goto('/staff/boards/meetings')
      const meetingRow = staff.getByRole('row').filter({ hasText: location })
      await meetingRow.getByText('Cancel', { exact: true }).click()
      await meetingRow.getByLabel('Reason').fill('Merged into the spring meeting')
      await meetingRow.getByRole('button', { name: 'Cancel meeting' }).click()
      await confirmWith(staff, /^Cancel the .* meeting\?$/, 'Cancel the meeting')
      await expect(meetingRow.getByText('Cancelled', { exact: true })).toBeVisible()

      const admin = await pageAs('admin')
      await admin.goto('/staff/settings/boards')
      const row = admin.getByRole('row').filter({ hasText: name })
      await row.getByRole('button', { name: `Archive ${name}` }).click()
      await confirmWith(admin, `Archive ${name}?`, 'Archive board')
      await expect(row.getByText('Archived', { exact: true })).toBeVisible()
      const stored = await db.one<{ archived: boolean }>(
        'select archived_at is not null as archived from boards where name = $1',
        [name],
      )
      expect(stored.archived).toBe(true)

      await staff.goto('/staff/boards/meetings')
      await staff.getByRole('button', { name: 'Add meeting' }).click()
      const dialog = staff.getByRole('dialog', { name: 'Add a meeting' })
      await expect(dialog.getByLabel('Board').locator('option', { hasText: name })).toHaveCount(0)

      const visitor = await pageAs('anonymous')
      await visitor.goto('/meetings')
      await expect(
        visitor.getByRole('link', { name: `Agenda: ${SHORT_NAME}, ${longDate(meetingDate)}` }),
      ).toBeVisible()
    })
  })
