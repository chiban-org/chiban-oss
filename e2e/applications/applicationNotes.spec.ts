import { accountFor, type E2eDb, expect, test } from '../fixtures/test'

const PROJECT_TITLE = 'Demo permit: Addition under review'
const ADD_NOTE = 'Add a note'

async function applicationId(db: E2eDb): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select a.id from applications a join projects p on p.id = a.project_id where p.title = $1',
    [PROJECT_TITLE],
  )
  return row.id
}

async function noteCount(db: E2eDb, id: string): Promise<number> {
  const row = await db.one<{ count: string }>(
    'select count(*) from application_notes where application_id = $1',
    [id],
  )
  return Number(row.count)
}

test.describe('staff notes on an application', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('saves a note, shows it under the clerk name and stores it with the clerk as author', async ({
      page,
      db,
      suffix,
    }) => {
      const id = await applicationId(db)
      const body = `Called the owner at 12 Heron Lane about the setback, ref ${suffix}`
      await page.goto(`/staff/applications/${id}`)
      const notes = page.getByRole('region', { name: 'Staff notes' })
      await notes.getByText(ADD_NOTE, { exact: true }).click()
      await notes.getByLabel('Note').fill(body)
      await notes.getByRole('button', { name: 'Add note' }).click()

      const item = notes.getByRole('listitem').filter({ hasText: body })
      await expect(item).toHaveCount(1)
      await expect(item.locator('p').first()).toHaveText(/^Sam Clerk, /)
      await expect(item.locator('p').last()).toHaveText(body)

      const row = await db.one<{ author_id: string }>(
        'select author_id from application_notes where application_id = $1 and body = $2',
        [id, body],
      )
      expect(row.author_id).toBe(await db.userIdFor(accountFor('staff').email))
    })

    test('refuses a note that is only spaces and stores nothing', async ({ page, db }) => {
      const id = await applicationId(db)
      const before = await noteCount(db, id)
      await page.goto(`/staff/applications/${id}`)
      const notes = page.getByRole('region', { name: 'Staff notes' })
      await notes.getByText(ADD_NOTE, { exact: true }).click()
      await notes.getByLabel('Note').fill('    ')
      await notes.getByRole('button', { name: 'Add note' }).click()

      await expect(notes.getByRole('status')).toHaveText('Write the note before saving it.')
      expect(await noteCount(db, id)).toBe(before)
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('shows the notes section without a way to add a note', async ({ page, db }) => {
      await page.goto(`/staff/applications/${await applicationId(db)}`)
      const notes = page.getByRole('region', { name: 'Staff notes' })
      await expect(notes.getByRole('heading', { level: 2 })).toHaveText('Staff notes')
      await expect(notes.getByText(ADD_NOTE, { exact: true })).toHaveCount(0)
    })
  })
})
