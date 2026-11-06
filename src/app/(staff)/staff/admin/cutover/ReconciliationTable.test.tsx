// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'

afterEach(cleanup)

const signOff = vi.hoisted(() => vi.fn((_: FormData) => Promise.resolve({ ok: true, message: '' })))
vi.mock('./actions', () => ({ signOffReconciliationAction: signOff }))

const { ReconciliationTable } = await import('./ReconciliationTable')

const ROW = {
  id: 'r1',
  createdAt: new Date('2026-11-05T19:23:00Z'),
  matched: 3,
  missing: 1,
  extra: 0,
  signedOffAt: null,
}

describe('ReconciliationTable sign-off', () => {
  it('asks before it signs a comparison off, and signs only on confirmation', async () => {
    render(
      <CsrfProvider token="t1">
        <ReconciliationTable rows={[ROW]} isAdmin={true} timeZone="America/New_York" />
      </CsrfProvider>,
    )
    const signedOff = () => signOff.mock.calls.filter(([f]) => !f.has(CHECK_ONLY_FIELD))
    fireEvent.click(screen.getByRole('button', { name: 'Sign off' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(signedOff()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Sign off this comparison' }))
    await vi.waitFor(() => expect(signedOff()).toHaveLength(1))
  })
})
