// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { AssociationRow, ParkRow } from '@/features/rosters/contactRows'

vi.mock('./rosterActions', () => ({
  addAssociationAction: vi.fn(),
  addParkAction: vi.fn(),
  updateAssociationAction: vi.fn(),
  updateParkAction: vi.fn(),
}))
vi.mock('./rosterEndActions', () => ({
  endRosterEntryAction: vi.fn(),
  undoRosterEndAction: vi.fn(),
}))
vi.mock('./confirmActions', () => ({ confirmEntryAction: vi.fn() }))
vi.mock('./actions', () => ({
  addRestrictionAction: vi.fn(),
  updateRestrictionAction: vi.fn(),
  endRestrictionAction: vi.fn(),
  undoRestrictionEndAction: vi.fn(),
}))

const { AssociationTable, ParkTable } = await import('./RosterTables')
const { RestrictionTable } = await import('./ContactTables')

afterEach(cleanup)

const active = {
  checkedText: 'Checked October 1, 2026',
  due: false,
  uses: [],
  versions: [],
  statusText: 'Active',
  endedOn: null,
  active: true,
  undoable: false,
}

function association(patch: Partial<AssociationRow>): AssociationRow {
  return {
    ...active,
    entryId: crypto.randomUUID(),
    parcelId: crypto.randomUUID(),
    parcel: '021-004',
    name: 'Heron Landing',
    officers: [{ name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105' }],
    asOf: '2026-10-01',
    ...patch,
  }
}

const park: ParkRow = {
  ...active,
  entryId: crypto.randomUUID(),
  parcelId: crypto.randomUUID(),
  parcel: '021-005',
  name: 'Loon Cove',
  owner: 'Loon Cove LLC',
  ownerMailingAddress: '1 Cove Road',
  tenants: [],
  asOf: '2026-09-15',
}

const links = {
  name: { href: '/staff/notice-contacts?sort=name&dir=desc', direction: 'asc' as const },
  parcel: { href: '/staff/notice-contacts?sort=parcel', direction: null },
  checked: { href: '/staff/notice-contacts?sort=checked', direction: null },
}

function show(node: React.ReactNode) {
  render(<CsrfProvider token="t1">{node}</CsrfProvider>)
}

function moreOf(row: HTMLElement, record: string) {
  const summary = within(row).getByText('More', { selector: 'summary' })
  expect(summary.getAttribute('aria-label')).toBe(`More actions for ${record}`)
  return summary.closest('details') as HTMLElement
}

describe('condo association and park tables', () => {
  it('keeps Edit and Confirm on the row and End under More, with a status chip', () => {
    show(<AssociationTable rows={[association({})]} today="2026-11-04" links={links} />)
    const row = screen.getByRole('row', { name: /Heron Landing/ })
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Edit Heron Landing' })).toBeTruthy()
    expect(
      within(row).getByRole('button', { name: 'Confirm Heron Landing still correct' }),
    ).toBeTruthy()
    const more = moreOf(row, 'Heron Landing')
    expect(within(more).getByRole('button', { name: 'End Heron Landing on 021-004' })).toBeTruthy()
    expect(
      within(row).getByText('Active').closest('[data-status]')?.getAttribute('data-status'),
    ).toBe('passed')
  })

  it('shows an ended association with Undo under More and no Edit, Confirm or End', () => {
    show(
      <AssociationTable
        rows={[
          association({
            statusText: 'Ended Nov 1, 2026',
            endedOn: '2026-11-01',
            active: false,
            undoable: true,
          }),
        ]}
        today="2026-11-04"
        links={links}
      />,
    )
    const row = screen.getByRole('row', { name: /Heron Landing/ })
    expect(within(row).getByText('Ended Nov 1, 2026')).toBeTruthy()
    expect(
      within(moreOf(row, 'Heron Landing')).getByRole('button', {
        name: 'Undo ending Heron Landing on 021-004',
      }),
    ).toBeTruthy()
    expect(within(row).queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(within(row).queryByRole('button', { name: /^Confirm / })).toBeNull()
    expect(within(row).queryByRole('button', { name: /^End / })).toBeNull()
  })

  it('offers no More when a row has nothing to put there', () => {
    show(
      <AssociationTable
        rows={[association({ endedOn: '2026-11-01', active: false, undoable: false })]}
        today="2026-11-04"
        links={links}
      />,
    )
    expect(screen.queryByText('More', { selector: 'summary' })).toBeNull()
  })

  it('folds park tenants into a count that opens to each name, site and address', () => {
    const tenants = [
      { tenantId: 't1', name: 'Cass Pryor', siteLabel: 'Site 4', mailingAddress: '4 Cove Road' },
      { tenantId: 't2', name: 'Lee Marsh', siteLabel: 'Site 5', mailingAddress: '5 Cove Road' },
    ]
    show(<ParkTable rows={[{ ...park, tenants }]} today="2026-11-04" links={links} />)
    const summary = screen.getByText('2 tenants', { selector: 'summary' })
    const details = summary.closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(within(details).getByText('Cass Pryor')).toBeTruthy()
    expect(within(details).getByText('4 Cove Road')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'End Loon Cove on 021-005' })).toBeTruthy()
  })

  it('sorts from the name, parcel and checked headers and anchors each row for deep links', () => {
    const row = association({})
    show(<AssociationTable rows={[row]} today="2026-11-04" links={links} />)
    const header = screen.getByRole('columnheader', { name: /Association/ })
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    expect(screen.getByRole('columnheader', { name: /Parcel/ }).querySelector('a')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: /Checked/ }).querySelector('a')).toBeTruthy()
    const tr = screen.getByRole('row', { name: /Heron Landing/ })
    expect(tr.id).toBe(`entry-${row.entryId}`)
    expect(tr.className).toMatch(/target:bg-highlight/)
    expect(tr.className).toMatch(/scroll-mt-/)
  })

  it('gives every roster table a desktop min width and breaks lines only between words', () => {
    show(
      <>
        <AssociationTable rows={[association({})]} today="2026-11-04" links={links} />
        <ParkTable rows={[park]} today="2026-11-04" links={links} />
        <RestrictionTable
          rows={[
            {
              ...active,
              entryId: crypto.randomUUID(),
              parcelId: crypto.randomUUID(),
              parcel: '021-006',
              holder: 'Heron Land Trust',
              holderMailingAddress: '2 Trust Way',
              kind: 'conservation',
              kindText: 'Conservation easement',
              reference: 'Book 1204, page 88',
            },
          ]}
          today="2026-11-04"
          links={links}
        />
      </>,
    )
    for (const table of screen.getAllByRole('table')) {
      expect(table.className).toMatch(/md:min-w-/)
      expect(table.className).toContain('[&_td]:[overflow-wrap:break-word]')
      expect(table.className).toMatch(/\[&_thead_th\]:sticky/)
    }
  })
})
