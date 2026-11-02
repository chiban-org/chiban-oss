// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusTimeline } from '@/components/portal/StatusTimeline'

afterEach(cleanup)

describe('StatusTimeline', () => {
  it('marks the current step and the steps already done in words', () => {
    render(<StatusTimeline state="under_review" />)
    expect(screen.getByText('Under review').closest('li')?.getAttribute('aria-current')).toBe(
      'step',
    )
    expect(screen.getByText('Submitted').closest('li')?.textContent).toContain('Done')
    expect(screen.getByText('Issued').closest('li')?.textContent).toContain('Not yet')
  })

  it('shows a terminal outcome as text', () => {
    render(<StatusTimeline state="denied" />)
    expect(screen.getByText('This application was denied.')).toBeTruthy()
  })

  it('a denied application shows review done and the decision made, with no permit to come', () => {
    render(<StatusTimeline state="denied" />)
    expect(screen.getByText('Under review').closest('li')?.textContent).toContain('Done')
    const decided = screen.getByText('Decided').closest('li')
    expect(decided?.getAttribute('aria-current')).toBe('step')
    expect(decided?.textContent).toContain('Done')
    expect(screen.getByText('Issued').closest('li')?.textContent).toContain('Will not happen')
    expect(screen.queryByText('Not yet')).toBeNull()
  })
})
