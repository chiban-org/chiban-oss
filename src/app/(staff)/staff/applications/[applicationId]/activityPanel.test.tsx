// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { findIsoDates, findUuids } from '@/test/leaks'
import { ActivityPanel } from './activityPanel'

afterEach(cleanup)

const ENTRIES = [
  {
    id: 'c3c3c3c3-0000-4000-8000-000000000003',
    at: new Date('2026-11-04T13:05:00Z'),
    who: 'Pat Planner',
    what: 'Assigned a reviewer',
  },
  {
    id: 'd4d4d4d4-0000-4000-8000-000000000004',
    at: new Date('2026-11-03T18:40:00Z'),
    who: 'Chiban, automatically',
    what: 'Paused a deadline',
  },
]

describe('recent activity panel', () => {
  it('reads each change as who, when and what, in the order given', () => {
    const { container } = render(<ActivityPanel entries={ENTRIES} zone="America/New_York" />)
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent)
    expect(items).toHaveLength(2)
    expect(items[0]).toContain('Pat Planner, ')
    expect(items[0]).toContain('Assigned a reviewer')
    expect(items[1]).toContain('Paused a deadline')
    expect(findIsoDates(container.textContent)).toEqual([])
    expect(findUuids(container.textContent)).toEqual([])
  })

  it('says when nothing has been recorded', () => {
    const { container } = render(<ActivityPanel entries={[]} zone="America/New_York" />)
    expect(container.textContent).toContain('No changes recorded yet.')
  })
})
