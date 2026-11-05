import { describe, expect, it, vi } from 'vitest'

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect ${to}`)
  }),
)
const requireStaffContext = vi.hoisted(() => vi.fn(() => Promise.resolve({})))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/server/requireStaff', () => ({ requireStaffContext }))

const { default: RostersPage } = await import('./page')

describe('the old rosters address', () => {
  it('sends a signed-in staff member to notice contacts', async () => {
    await expect(RostersPage()).rejects.toThrow('redirect /staff/notice-contacts')
    expect(requireStaffContext).toHaveBeenCalled()
  })
})
