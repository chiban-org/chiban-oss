// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type ChecklistItem, NoticeChecklist } from '@/components/notices/NoticeChecklist'
import { findIsoDates, findRawKeys } from '@/test/leaks'

afterEach(cleanup)

const ITEMS: ChecklistItem[] = [
  {
    itemId: '1',
    channel: 'Verified mail',
    recipientName: 'Pat Heron',
    recipientAddress: '12 Heron Lane',
    dueOn: 'April 4, 2027',
    proof: { method: 'Certificate of mailing', reference: null, effectiveOn: 'April 1, 2027' },
    state: 'proved_on_time',
  },
  {
    itemId: '2',
    channel: 'Newspaper',
    recipientName: 'Alder Pond Ledger',
    recipientAddress: null,
    dueOn: 'April 4, 2027',
    proof: null,
    state: 'missing',
  },
  {
    itemId: '3',
    channel: 'Certified mail',
    recipientName: 'Pine River',
    recipientAddress: null,
    dueOn: 'March 31, 2027',
    proof: { method: 'Certified mail receipt', reference: 'RR-0042', effectiveOn: 'April 2, 2027' },
    state: 'proved_late',
  },
]

describe('NoticeChecklist', () => {
  it('shows "Missing" with an icon and text', () => {
    const { container } = render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    const row = screen.getByText('Alder Pond Ledger').closest('tr') as HTMLElement
    expect(within(row).getByText('Missing')).toBeTruthy()
    expect(row.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('[data-status]').length).toBe(3)
  })

  it('labels on time and late items in words', () => {
    render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    expect(screen.getByText('On time')).toBeTruthy()
    expect(screen.getByText('Late')).toBeTruthy()
  })

  it('lists channel, recipient, due date, proof method and reference', () => {
    render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    const row = screen.getByText('Pine River').closest('tr') as HTMLElement
    expect(within(row).getByText('Certified mail')).toBeTruthy()
    expect(within(row).getByText('March 31, 2027')).toBeTruthy()
    expect(within(row).getByText(/Certified mail receipt/)).toBeTruthy()
    expect(within(row).getByText(/RR-0042/)).toBeTruthy()
  })

  it('scrolls the table inside its own panel', () => {
    const { container } = render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    expect(container.querySelector('.table-panel > table')).not.toBeNull()
  })

  it('lists missing and late items before the ones proved on time', () => {
    render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent)
    expect(names[0]).toContain('Alder Pond Ledger')
    expect(names[1]).toContain('Pine River')
    expect(names[2]).toContain('Pat Heron')
  })

  it('states a shared due date once instead of on every row', () => {
    const shared = ITEMS.map((i) => ({ ...i, dueOn: 'April 4, 2027' }))
    render(<NoticeChecklist items={shared} noticedOn={null} />)
    expect(screen.getByText('All due April 4, 2027.')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'Due' })).toBeNull()
    expect(screen.queryAllByText('April 4, 2027')).toHaveLength(0)
  })

  it('keeps the due column when the dates differ', () => {
    render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    expect(screen.getByRole('columnheader', { name: 'Due' })).toBeTruthy()
  })

  it('folds a list proved on time to one line with the date it was marked noticed', () => {
    const { container } = render(
      <NoticeChecklist items={ITEMS.slice(0, 1)} noticedOn="April 2, 2027" />,
    )
    const summary = container.querySelector('details > summary')
    expect(summary?.textContent).toBe('The notice was proved on time, marked noticed April 2, 2027')
    expect(container.querySelector('details')?.hasAttribute('open')).toBe(false)
  })

  it('folds without a marked date when there is none', () => {
    const twice = [ITEMS[0], { ...ITEMS[0], itemId: '4' }] as ChecklistItem[]
    const { container } = render(<NoticeChecklist items={twice} noticedOn={null} />)
    expect(container.querySelector('details > summary')?.textContent).toBe(
      'All 2 notices proved on time',
    )
  })

  it('keeps an open list unfolded', () => {
    const { container } = render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    expect(container.querySelector('details')).toBeNull()
  })

  it('shows no iso dates, ids, or raw keys', () => {
    const { container } = render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    const text = container.textContent
    expect(findIsoDates(text)).toEqual([])
    expect(findRawKeys(text, ['proved_late', 'proved_on_time', 'verified_mail'])).toEqual([])
  })
})
