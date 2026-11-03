// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortBar, SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'

afterEach(cleanup)

function header(node: ReactNode) {
  render(
    <table>
      <thead>
        <tr>{node}</tr>
      </thead>
    </table>,
  )
  return screen.getByRole('columnheader')
}

describe('SortHeader', () => {
  it('marks the sorted column with aria-sort and links to the flipped order', () => {
    const th = header(<SortHeader label="Due" link={{ href: '/q?dir=desc', direction: 'asc' }} />)
    expect(th.getAttribute('scope')).toBe('col')
    expect(th.getAttribute('aria-sort')).toBe('ascending')
    const link = within(th).getByRole('link', { name: 'Due' })
    expect(link.getAttribute('href')).toBe('/q?dir=desc')
  })

  it('leaves aria-sort off a column that is not sorted', () => {
    const th = header(<SortHeader label="Fees" link={{ href: '/q?sort=fees', direction: null }} />)
    expect(th.hasAttribute('aria-sort')).toBe(false)
    expect(within(th).getByRole('link', { name: 'Fees' })).toBeTruthy()
  })

  it('renders a plain heading when there is no link', () => {
    const th = header(<SortHeader label="Reviewers" />)
    expect(within(th).queryByRole('link')).toBeNull()
    expect(th.textContent).toBe('Reviewers')
  })
})

describe('SortBar', () => {
  it('lists every sort with the current one marked', () => {
    render(
      <SortBar
        options={[
          { label: 'Due', link: { href: '/q?dir=desc', direction: 'asc' } },
          { label: 'Fees', link: { href: '/q?sort=fees', direction: null } },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Sort' })
    expect(within(nav).getByRole('link', { name: 'Due, ascending' })).toBeTruthy()
    expect(
      within(nav).getByRole('link', { name: 'Due, ascending' }).getAttribute('aria-current'),
    ).toBe('true')
    expect(within(nav).getByRole('link', { name: 'Fees' }).hasAttribute('aria-current')).toBe(false)
  })
})

describe('QuickFilters', () => {
  const groups = [
    {
      label: 'Deadline',
      chips: [
        { label: 'Overdue', href: '/q', active: true, count: 2 },
        { label: 'Due this week', href: '/q?due=overdue&due=week', active: false, count: 0 },
      ],
    },
  ]

  it('groups chips, marks the active one, shows counts, and offers a way to clear', () => {
    render(<QuickFilters label="Quick filters" groups={groups} clearHref="/q" />)
    const group = screen.getByRole('group', { name: 'Deadline' })
    const active = within(group).getByRole('link', { name: /Overdue/ })
    expect(active.getAttribute('aria-current')).toBe('true')
    expect(active.textContent).toContain('2')
    const idle = within(group).getByRole('link', { name: /Due this week/ })
    expect(idle.hasAttribute('aria-current')).toBe(false)
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/q')
  })

  it('has no clear link when nothing is filtered', () => {
    render(<QuickFilters label="Quick filters" groups={groups} clearHref={null} />)
    expect(screen.queryByRole('link', { name: 'Clear filters' })).toBeNull()
  })
})

describe('TablePager', () => {
  it('shows the range and both links', () => {
    render(<TablePager offset={25} shown={25} total={60} prevHref="/q" nextHref="/q?cursor=50" />)
    expect(screen.getByText('26-50 of 60')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/q')
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/q?cursor=50',
    )
  })

  it('renders nothing on a single page', () => {
    const { container } = render(
      <TablePager offset={0} shown={3} total={3} prevHref={null} nextHref={null} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
