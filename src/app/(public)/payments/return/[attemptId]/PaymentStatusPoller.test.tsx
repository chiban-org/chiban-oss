// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentStatusPoller } from './PaymentStatusPoller'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
const { refresh } = router
vi.mock('next/navigation', () => ({ useRouter: () => router }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  refresh.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PaymentStatusPoller', () => {
  it('says it is waiting and checks again every few seconds', () => {
    render(<PaymentStatusPoller />)
    expect(screen.getByRole('status').textContent).toContain('This page checks again every few')
    act(() => {
      vi.advanceTimersByTime(9_000)
    })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('stops after two minutes and says so, promising no second charge', () => {
    render(<PaymentStatusPoller />)
    act(() => {
      vi.advanceTimersByTime(123_000)
    })
    const calls = refresh.mock.calls.length
    expect(screen.getByRole('status').textContent).toBe(
      'Still waiting on the processor. You will not be charged twice.',
    )
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(refresh.mock.calls.length).toBe(calls)
  })
})
