import {
  E2E_BASE_URL,
  expect,
  linkIn,
  signInWithMagicLink,
  test,
  uniqueEmail,
  waitForEmail,
} from '../fixtures/test'
import { messageAlert } from '../public/alert'

test.describe('signing in by emailed link', () => {
  test('refuses an address without a domain suffix beside the form and sends nothing', async ({
    page,
    suffix,
  }) => {
    const since = new Date()
    await page.goto('/sign-in')
    await page.getByLabel('Email address').fill(`nobody-${suffix}@localhost`)
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
    await expect(page.getByRole('status')).toHaveText(
      'Enter an email address like name@example.com.',
    )
    await expect(
      waitForEmail({ to: `nobody-${suffix}@localhost`, since, timeoutMs: 1_500 }),
    ).rejects.toThrow('no email to')
  })

  test('creates the account of a first-time visitor on the confirmed link and signs them in', async ({
    page,
    db,
    suffix,
  }) => {
    const email = uniqueEmail('newcomer', suffix)
    expect(await db.rows('select id from users where email = $1', [email])).toHaveLength(0)
    await page.goto('/portal')
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fportal$/)
    await signInWithMagicLink(page, email)
    await expect(page).toHaveURL('/portal')
    const created = await db.one<{ kind: string; role: string }>(
      `select u.kind, r.role from users u join user_roles r on r.user_id = u.id where u.email = $1`,
      [email],
    )
    expect(created).toEqual({ kind: 'public', role: 'applicant' })
  })

  test('shows a link already used as no longer valid', async ({ page, suffix }) => {
    const email = uniqueEmail('used-link', suffix)
    const since = new Date()
    await signInWithMagicLink(page, email)
    const prefix = `${E2E_BASE_URL}/auth/verify?token=`
    const message = await waitForEmail({ to: email, since, containing: prefix })
    await page.goto(linkIn(message, prefix))
    await expect(messageAlert(page)).toHaveText('That link is no longer valid. Request a new one.')
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    )
  })
})
