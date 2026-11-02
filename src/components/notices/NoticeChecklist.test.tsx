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

  it('disables Mark properly noticed and shows the count of items that are not on time', () => {
    render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    const button = screen.getByRole('button', { name: 'Mark properly noticed' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('2 items still need timely proof.')).toBeTruthy()
  })

  it('shows no mark button at all when the checklist is not for a hearing', () => {
    render(<NoticeChecklist items={ITEMS} noticedOn={null} showMark={false} />)
    expect(screen.queryByRole('button', { name: 'Mark properly noticed' })).toBeNull()
    expect(screen.queryByText(/still need/)).toBeNull()
  })

  it('says it once when exactly one item is outstanding', () => {
    render(<NoticeChecklist items={ITEMS.slice(0, 2)} noticedOn={null} />)
    expect(screen.getByText('1 item still needs timely proof.')).toBeTruthy()
  })

  it('shows the mark slot instead of the disabled button when every item is on time', () => {
    render(
      <NoticeChecklist
        items={ITEMS.slice(0, 1)}
        noticedOn={null}
        markSlot={<button type="button">Mark properly noticed now</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Mark properly noticed now' })).toBeTruthy()
    expect(screen.queryByText(/still needs? timely proof/)).toBeNull()
  })

  it('says when the hearing was marked properly noticed', () => {
    render(<NoticeChecklist items={ITEMS.slice(0, 1)} noticedOn="April 2, 2027" />)
    expect(screen.getByText('Marked properly noticed on April 2, 2027.')).toBeTruthy()
  })

  it('shows no iso dates, ids, or raw keys', () => {
    const { container } = render(<NoticeChecklist items={ITEMS} noticedOn={null} />)
    const text = container.textContent
    expect(findIsoDates(text)).toEqual([])
    expect(findRawKeys(text, ['proved_late', 'proved_on_time', 'verified_mail'])).toEqual([])
  })
})
