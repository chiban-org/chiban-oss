// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { QueueTable } from '@/components/queue/QueueTable'
import { d, row, setup } from '@/components/queue/queueTestKit'
import { findIsoDates } from '@/test/leaks'

const noopAssign = () => Promise.resolve({ ok: true as const, message: 'Assigned.' })

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const scrollIntoView = vi.fn()

beforeEach(() => {
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(cleanup)

describe('QueueTable cells', () => {
  it('shows the notice and filing due dates in short words', () => {
    setup([row({ noticeDue: d('2027-04-10'), filingDue: d('2027-04-22') })])
    expect(screen.getByText('Notice due Apr 10, 2027')).toBeTruthy()
    expect(screen.getByText('Filing due Apr 22, 2027')).toBeTruthy()
    expect(findIsoDates(document.body.textContent)).toEqual([])
  })

  it('says a past filing or notice date is overdue', () => {
    setup([
      row({
        noticeDue: d('2027-04-10'),
        noticeOverdue: true,
        filingDue: d('2027-04-22'),
        filingOverdue: true,
      }),
    ])
    expect(screen.getByText('Notice overdue, due Apr 10, 2027')).toBeTruthy()
    expect(screen.getByText('Filing overdue, due Apr 22, 2027')).toBeTruthy()
  })

  it('puts the project under the number and shows the received date or its absence', () => {
    setup([
      row({ number: 'BP-2027-0001', projectTitle: 'Barn loft', receivedDate: d('2027-02-10') }),
      row({ number: 'BP-2027-0002', projectTitle: 'Shed', receivedDate: null }),
    ])
    const first = screen.getByRole('link', { name: 'BP-2027-0001' }).closest('td')
    expect(first?.textContent).toContain('Barn loft')
    expect(screen.getByText('Feb 10, 2027')).toBeTruthy()
    expect(screen.getByText('Not received')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: /^Project/ })).toBeNull()
  })

  it('gives the Application heading a single sort link', () => {
    const link = (key: string) => ({ href: `/staff/applications?sort=${key}`, direction: null })
    const sort = Object.fromEntries(
      ['number', 'project', 'parcel', 'status', 'due', 'fees', 'reviewers', 'received'].map((k) => [
        k,
        link(k),
      ]),
    ) as unknown as Parameters<typeof QueueTable>[0]['sort']
    render(
      <CsrfProvider token="t1">
        <QueueTable rows={[row({})]} reviewers={[]} assign={noopAssign} sort={sort} />
      </CsrfProvider>,
    )
    const heading = screen.getByRole('columnheader', { name: /^Application/ })
    expect(
      within(heading)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Application'])
  })

  it('gives the parcel its own column linking to the parcel page', () => {
    setup([row({ parcelId: 'p9', parcelDisplayId: '007009000000' })])
    const link = screen.getByRole('link', { name: '007009000000' })
    expect(link.getAttribute('href')).toBe('/staff/parcels/p9')
    expect(screen.queryByText(/Building permit, 007009000000/)).toBeNull()
  })

  it('does not repeat the filing date when it is already the next deadline', () => {
    setup([row({ nextDue: d('2027-04-22'), filingDue: d('2027-04-22') })])
    expect(screen.queryByText(/Filing (due|overdue)/)).toBeNull()
  })

  it('writes the state, substep label, and reviewer status in words', () => {
    setup([
      row({
        state: 'issued',
        substep: 'co_pending',
        substepLabel: 'Certificate of occupancy pending',
        reviewers: [{ name: 'Remy Reviewer', status: 'signed_off' }],
      }),
    ])
    expect(screen.getByText('Issued, certificate of occupancy pending')).toBeTruthy()
    expect(screen.getByText('Remy Reviewer (Signed off)')).toBeTruthy()
  })

  it('names the running clock and its date', () => {
    setup([
      row({
        dueStatus: 'ok',
        nextDue: d('2026-11-12'),
        nextDueLabel: 'Building permit decision deadline',
        daysUntilDue: 9,
      }),
    ])
    expect(screen.getByText('Nov 12, 2026')).toBeTruthy()
    expect(screen.getByText('Building permit decision deadline')).toBeTruthy()
  })

  it('says how many days an overdue clock is late and when it was due', () => {
    setup([
      row({
        dueStatus: 'overdue',
        nextDue: d('2026-10-27'),
        nextDueLabel: 'ZBA decision deadline',
        daysUntilDue: -7,
      }),
    ])
    expect(screen.getByText('7 days overdue')).toBeTruthy()
    expect(screen.getByText('ZBA decision deadline, Oct 27, 2026')).toBeTruthy()
  })

  it('says one day overdue in the singular', () => {
    setup([row({ dueStatus: 'overdue', nextDue: d('2027-03-01'), daysUntilDue: -1 })])
    expect(screen.getByText('1 day overdue')).toBeTruthy()
  })

  it('warns with the highlight phrase within five days', () => {
    setup([row({ dueStatus: 'warning', nextDue: d('2027-03-05'), daysUntilDue: 3 })])
    expect(screen.getByText('Due in 3 days').className).toContain('attention')
  })

  it('leaves the due cell empty when no clock is running', () => {
    setup([row({})])
    expect(document.querySelector('td[data-label="Due"]')?.textContent).toBe('')
  })

  it('shows dollars due without repeating the column name, and flags as words', () => {
    setup([row({ feesDueCents: 4635, unknownPayment: true, preservationIncomplete: true })])
    expect(screen.getByText('$46.35')).toBeTruthy()
    expect(screen.queryByText('$46.35 due')).toBeNull()
    expect(screen.getByText('Payment outcome unknown')).toBeTruthy()
    expect(screen.getByText('Preservation incomplete')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'Flags' })).toBeNull()
  })

  it('reads no fees as none rather than a blank', () => {
    setup([row({})])
    expect(document.querySelector('td[data-label="Fees"]')?.textContent).toContain('None')
  })

  it('scopes every column header', () => {
    setup([row({})])
    for (const th of document.querySelectorAll('thead th')) {
      expect(th.getAttribute('scope')).toBe('col')
    }
  })

  it('renders the empty state inside the table panel', () => {
    setup([])
    const message = screen.getByText('Nothing matches these filters.')
    expect(message.closest('.table-panel')).not.toBeNull()
  })
})
