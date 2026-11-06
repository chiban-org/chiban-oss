// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RestoreVersion } from '@/components/config/RestoreVersion'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'

afterEach(cleanup)

const rollback = vi.hoisted(() =>
  vi.fn((_: FormData) => Promise.resolve({ ok: true as const, message: 'Restored.' })),
)

vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))
vi.mock('@/app/(staff)/staff/settings/actions', () => ({ rollbackAction: rollback }))

describe('restoring a version asks first', () => {
  it('explains what happens and restores only after the second click', async () => {
    render(<RestoreVersion kind="fee_schedule" configKey="bp-fees" version={2} pinned />)
    const restored = () => rollback.mock.calls.filter(([f]) => !f.has(CHECK_ONLY_FIELD))
    fireEvent.click(screen.getByRole('button', { name: 'Restore version 2' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('published again as a new version')
    expect(dialog.textContent).toContain('Open applications keep the version they started under.')
    expect(restored()).toEqual([])
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Restore version 2' }).at(-1) as HTMLElement,
    )
    await waitFor(() => expect(restored()).toHaveLength(1))
    const sent = restored()[0]?.[0]
    expect([sent?.get('kind'), sent?.get('key'), sent?.get('toVersion')]).toEqual([
      'fee_schedule',
      'bp-fees',
      '2',
    ])
  })
})
