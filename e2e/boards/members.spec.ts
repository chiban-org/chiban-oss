import { expect, test, uniqueEmail, waitForEmail } from '../fixtures/test'
import { confirmWith, permissionAlert } from './confirm'
import { daysFromToday } from './records'
import { expectRefused } from './refusal'

test.describe
  .serial('board members', () => {
    test.use({ role: 'staff' })
    let email: string
    let name: string
    let renamed: string

    test('refuses a member without an email address', async ({ page, suffix }) => {
      name = `Pat Lindqvist ${suffix}`
      await page.goto('/staff/boards/members')
      await page.getByRole('button', { name: 'Add member' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a board member' })
      await dialog.getByLabel(/^Name/).fill(name)
      await dialog.getByRole('button', { name: 'Add member' }).click()
      await expectRefused(dialog.getByLabel(/^Email address/), 'Fill in: Email address.')
    })

    test('adds a member, stores the seat and emails how to sign in', async ({
      page,
      db,
      suffix,
    }) => {
      email = uniqueEmail('member', suffix)
      const since = new Date()
      await page.goto('/staff/boards/members')
      await page.getByRole('button', { name: 'Add member' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a board member' })
      await dialog.getByLabel(/^Name/).fill(name)
      await dialog.getByLabel(/^Email address/).fill(email)
      await dialog.getByLabel('Board', { exact: true }).selectOption('zba')
      await dialog.getByLabel('Role on the board').selectOption('alternate')
      await dialog.getByRole('button', { name: 'Add member' }).click()
      await waitForEmail({ to: email, since })
      const seat = await db.one<{ board: string; title: string; term_end: string | null }>(
        `select m.board, m.title, m.term_end::text from board_memberships m
       join users u on u.id = m.user_id where u.email = $1`,
        [email],
      )
      expect(seat).toEqual({ board: 'zba', title: 'alternate', term_end: null })
    })

    test('refuses a term that ends before it starts beside the end date', async ({ page, db }) => {
      await page.goto('/staff/boards/members')
      const row = page.getByRole('row').filter({ hasText: email })
      await row.getByRole('button', { name: `Edit ${name}` }).click()
      const dialog = page.getByRole('dialog', { name: `Edit ${name}` })
      await dialog.getByLabel('Term ends').fill(await daysFromToday(db, -400))
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expect(dialog.getByLabel('Term ends')).toHaveAttribute('aria-invalid', 'true')
    })

    test('updates the member name and stores it', async ({ page, db, suffix }) => {
      renamed = `Pat Lindqvist-Ruiz ${suffix}`
      await page.goto('/staff/boards/members')
      const row = page.getByRole('row').filter({ hasText: email })
      await row.getByRole('button', { name: `Edit ${name}` }).click()
      const dialog = page.getByRole('dialog', { name: `Edit ${name}` })
      await dialog.getByLabel(/^Name/).fill(renamed)
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expect
        .poll(async () => {
          const user = await db.one<{ display_name: string }>(
            'select display_name from users where email = $1',
            [email],
          )
          return user.display_name
        })
        .toBe(renamed)
    })

    test('ends the membership only after the confirmation', async ({ page, db }) => {
      await page.goto('/staff/boards/members')
      const row = page.getByRole('row').filter({ hasText: email })
      await row.getByRole('button', { name: 'End membership' }).click()
      await confirmWith(page, `End ${renamed}'s membership?`, 'End membership')
      await expect
        .poll(async () => {
          const seat = await db.one<{ ended: boolean }>(
            `select m.term_end is not null as ended from board_memberships m
           join users u on u.id = m.user_id where u.email = $1`,
            [email],
          )
          return seat.ended
        })
        .toBe(true)
    })
  })

test.describe('members without the capability', () => {
  test.use({ role: 'inspector' })

  test('has no add form and says so', async ({ page }) => {
    await page.goto('/staff/boards/members')
    await expect(permissionAlert(page)).toHaveText(
      'You do not have permission to manage board members.',
    )
    await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0)
  })
})
