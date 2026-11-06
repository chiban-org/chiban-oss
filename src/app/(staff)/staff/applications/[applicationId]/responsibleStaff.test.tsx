// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'

vi.mock('./responsibleActions', () => ({
  setResponsibleStaffAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { ResponsibleStaff } = await import('./responsibleStaff')

afterEach(cleanup)

const CHOICES = [
  { id: 'u1', name: 'Pat Planner' },
  { id: 'u2', name: 'Sam Clerk' },
]

function show(current: { userId: string; name: string } | null, canManage: boolean) {
  render(
    <CsrfProvider token="t">
      <ResponsibleStaff
        applicationId="a1"
        data={{ current, choices: canManage ? CHOICES : [], canManage }}
      />
    </CsrfProvider>,
  )
}

describe('ResponsibleStaff', () => {
  it('names the responsible staff member and offers a change to someone who may make it', () => {
    show({ userId: 'u1', name: 'Pat Planner' }, true)
    expect(screen.getByText('Pat Planner', { selector: 'dd *, dd' })).toBeTruthy()
    expect(screen.getByText('Change who is responsible')).toBeTruthy()
    const select = screen.getByLabelText<HTMLSelectElement>('Responsible staff member')
    expect([...select.options].map((o) => o.text)).toEqual(['Nobody', 'Pat Planner', 'Sam Clerk'])
    expect(select.value).toBe('u1')
  })

  it('says nobody is responsible and shows no control without application.manage', () => {
    show(null, false)
    expect(screen.getByText('Nobody yet')).toBeTruthy()
    expect(screen.queryByText(/who is responsible/)).toBeNull()
    expect(screen.queryByLabelText('Responsible staff member')).toBeNull()
  })

  it('invites taking an unowned application', () => {
    show(null, true)
    expect(screen.getByText('Assign a responsible staff member')).toBeTruthy()
  })
})
