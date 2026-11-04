// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RestoreVersion } from '@/components/config/RestoreVersion'

afterEach(cleanup)

const rollback = vi.hoisted(() =>
  vi.fn((_: FormData) => Promise.resolve({ ok: true as const, message: 'Restored.' })),
)

vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))
vi.mock('@/app/(staff)/staff/settings/actions', () => ({ rollbackAction: rollback }))

describe('restoring a version asks first', () => {
  it('explains what happens and restores only after the second click', async () => {
    render(<RestoreVersion kind="fee_schedule" configKey="bp-fees" version={2} pinned />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore version 2' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('published again as a new version')
    expect(dialog.textContent).toContain('Open applications keep the version they started under.')
    expect(rollback).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Restore version 2' }).at(-1) as HTMLElement,
    )
    await waitFor(() => expect(rollback).toHaveBeenCalledTimes(1))
    const sent = rollback.mock.calls[0]?.[0]
    expect([sent?.get('kind'), sent?.get('key'), sent?.get('toVersion')]).toEqual([
      'fee_schedule',
      'bp-fees',
      '2',
    ])
  })
})
