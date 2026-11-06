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

function show(node: React.ReactNode) {
  render(<CsrfProvider token="t1">{node}</CsrfProvider>)
}

describe('condo association and park tables', () => {
  it('offers End beside Edit on an association in force, with its status', () => {
    show(<AssociationTable rows={[association({})]} today="2026-11-04" />)
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit Heron Landing' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'End Heron Landing on 021-004' })).toBeTruthy()
  })

  it('shows an ended association with Undo while allowed and no Edit or End', () => {
    show(
      <AssociationTable
        rows={[
          association({
            statusText: 'Ended November 1, 2026',
            endedOn: '2026-11-01',
            active: false,
            undoable: true,
          }),
        ]}
        today="2026-11-04"
      />,
    )
    const row = screen.getByRole('row', { name: /Heron Landing/ })
    expect(within(row).getByText('Ended November 1, 2026')).toBeTruthy()
    expect(
      within(row).getByRole('button', { name: 'Undo ending Heron Landing on 021-004' }),
    ).toBeTruthy()
    expect(within(row).queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(within(row).queryByRole('button', { name: /^End / })).toBeNull()
  })

  it('offers End on a park too', () => {
    show(<ParkTable rows={[park]} today="2026-11-04" />)
    expect(screen.getByRole('button', { name: 'End Loon Cove on 021-005' })).toBeTruthy()
  })

  it('lets every roster table shrink to the content width so the row actions stay visible', () => {
    show(
      <>
        <AssociationTable rows={[association({})]} today="2026-11-04" />
        <ParkTable rows={[park]} today="2026-11-04" />
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
              kindText: 'Conservation',
              reference: 'Book 1204, page 88',
            } as never,
          ]}
          today="2026-11-04"
        />
      </>,
    )
    for (const table of screen.getAllByRole('table')) {
      expect(table.className).not.toMatch(/(^|\s)min-w-/)
    }
  })
})
