import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/requireStaff', () => ({
  requireStaffActor: () =>
    Promise.resolve({ userId: 'u', kind: 'staff', roles: ['records_custodian', 'staff'] }),
}))
vi.mock('./actions', () => ({
  signOutAction: () => undefined,
  changeNameAction: () => ({ error: null, message: null }),
  changePasswordAction: () => ({ error: null, message: null }),
}))
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/features/auth/accountSummary', () => ({
  loadAccountSummary: () =>
    Promise.resolve({
      displayName: 'Rae Records',
      email: 'rae@example.test',
      totpEnabled: false,
      hasPassword: true,
    }),
}))
vi.mock('@/components/CsrfField', () => ({ CsrfField: () => null }))

const { default: StaffAccountPage } = await import('./page')

async function html(search: Record<string, string>): Promise<string> {
  return renderToStaticMarkup(
    (await StaffAccountPage({ searchParams: Promise.resolve(search) })) as never,
  )
}

describe('staff account page', () => {
  it('confirms a finished authenticator setup', async () => {
    expect(await html({ totp: 'enabled' })).toContain('Authenticator is set up')
    expect(await html({})).not.toContain('Authenticator is set up')
  })

  it('names roles the way the menu does', async () => {
    const page = await html({})
    expect(page).toContain('Records custodian, Land use staff')
    expect(page).not.toContain('Records custodian, Staff')
  })

  it('lays out the person as facts and signs out with a styled button', async () => {
    const page = await html({})
    expect(page).toMatch(/<dt[^>]*>Email<\/dt><dd[^>]*>rae@example.test<\/dd>/)
    expect(page).toMatch(/<button[^>]*data-slot="button"[^>]*>Sign out<\/button>/)
    expect(page).not.toContain('max-w-md')
  })

  it('names the person and says whether an authenticator is set up', async () => {
    const page = await html({})
    expect(page).toContain('Rae Records')
    expect(page).toContain('rae@example.test')
    expect(page).toContain('Not set up. Sign-in asks only for your password.')
  })

  it('offers a name field filled in and a password change that asks for the current password', async () => {
    const page = await html({})
    expect(page).toMatch(/<input[^>]*name="displayName"[^>]*value="Rae Records"/)
    expect(page).toContain('Current password')
    expect(page).toContain('New password')
    expect(page).toContain('Change password')
  })
})
