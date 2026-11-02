import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/requireStaff', () => ({
  requireStaffActor: () =>
    Promise.resolve({ userId: 'u', kind: 'staff', roles: ['records_custodian'] }),
}))
vi.mock('./actions', () => ({ signOutAction: () => undefined }))
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

  it('shows role names as words', async () => {
    expect(await html({})).toContain('Records custodian')
  })
})
