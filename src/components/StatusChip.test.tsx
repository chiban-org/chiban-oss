// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusChip } from '@/components/StatusChip'

afterEach(cleanup)

describe('StatusChip', () => {
  it.each([
    'passed',
    'failed',
    'overdue',
    'neutral',
  ] as const)('renders a text label and an icon for %s', (status) => {
    const { container } = render(<StatusChip status={status} label={`Label ${status}`} />)
    expect(screen.getByText(`Label ${status}`)).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('marks the icon decorative so the label carries the meaning', () => {
    const { container } = render(<StatusChip status="failed" label="Failed" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('pins the icon to the first line when a long label wraps', () => {
    const { container } = render(<StatusChip status="neutral" label="Submitted, meeting set" />)
    expect(container.firstElementChild?.className).toContain('items-start')
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('mt-0.5')
  })
})
