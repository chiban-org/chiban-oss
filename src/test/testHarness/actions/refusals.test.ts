import { describe, expect, it, vi } from 'vitest'
import { ROLES } from '@/constants/roles'

vi.mock('@/db/client', () => ({ db: {} }))

const { PORTAL_REFUSALS, STAFF_REFUSALS } = await import('./refusals')
const { errorCopy } = await import('@/server/actionRunner')

describe('refusal constants', () => {
  it('refuses every role on a portal action as forbidden, applicant and contractor included', () => {
    const forbidden = PORTAL_REFUSALS.forbidden
    const byRole = ROLES.map((role) =>
      typeof forbidden === 'function' ? forbidden(role) : forbidden,
    )
    expect(new Set(byRole.map((r) => JSON.stringify(r)))).toEqual(
      new Set([JSON.stringify({ ok: false, error: errorCopy('forbidden') })]),
    )
  })

  it('treats applicant and contractor as signed out on a staff action', () => {
    const forbidden = STAFF_REFUSALS.forbidden
    if (typeof forbidden !== 'function') throw new Error('expected a per-role refusal')
    expect([forbidden('applicant'), forbidden('contractor'), forbidden('finance')]).toEqual([
      { ok: false, error: errorCopy('signed_out') },
      { ok: false, error: errorCopy('signed_out') },
      { ok: false, error: errorCopy('forbidden') },
    ])
  })

  it('expects an action that has not adopted the form contract to refuse a check-only request', () => {
    const expected = { ok: false, error: errorCopy('check_unsupported') }
    expect([STAFF_REFUSALS.checkOnly, PORTAL_REFUSALS.checkOnly]).toEqual([expected, expected])
  })
})
