// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { AssociationRow, HoldingRow, ParkRow } from '@/features/rosters/contactRows'

vi.mock('./rosterActions', () => ({
  addAssociationAction: vi.fn(),
  addParkAction: vi.fn(),
  updateAssociationAction: vi.fn(),
  updateParkAction: vi.fn(),
}))
vi.mock('./actions', () => ({
  addRestrictionAction: vi.fn(),
  updateRestrictionAction: vi.fn(),
  endRestrictionAction: vi.fn(),
  undoRestrictionEndAction: vi.fn(),
}))

const { AddAssociation, EditAssociation } = await import('./AssociationForms')
const { EditPark } = await import('./ParkForms')
const { EditHolder, EndHolder } = await import('./HolderForms')

afterEach(cleanup)

const meta = {
  checkedText: 'October 1, 2026',
  due: false,
  uses: [],
  versions: [],
  statusText: 'Active',
  endedOn: null,
  active: true,
  undoable: false,
}

const association: AssociationRow = {
  ...meta,
  entryId: '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  parcelId: '7d3f6a4e-0c2b-4a51-9d1e-3f2b8c6a9e10',
  parcel: '021-004',
  name: 'Heron Landing',
  officers: [
    { name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105, Alder Pond NH' },
    { name: 'Lee Marsh', title: 'Treasurer', mailingAddress: '12 Loon Road, Alder Pond NH' },
  ],
  asOf: '2026-10-01',
}

const park: ParkRow = {
  ...meta,
  entryId: '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a',
  parcelId: '9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
  parcel: '021-005',
  name: 'Loon Cove',
  owner: 'Loon Cove LLC',
  ownerMailingAddress: '1 Cove Road, Alder Pond NH 03999',
  tenants: [
    { tenantId: 'site-4', name: 'Rory Pike', siteLabel: 'Site 4', mailingAddress: '4 Court' },
  ],
  asOf: '2026-09-15',
}

const holding: HoldingRow = {
  ...meta,
  entryId: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  parcelId: association.parcelId,
  parcel: '021-004',
  holder: 'Alder Pond Land Trust',
  holderMailingAddress: '1 Trust Way, Alder Pond NH 03999',
  kind: 'preservation',
  kindText: 'Preservation easement',
  reference: 'Book 1 Page 2',
  statusText: 'Active',
  endedOn: null,
  active: true,
  undoable: false,
}

function field(label: string, scope: HTMLElement = document.body): HTMLInputElement {
  return within(scope).getByLabelText<HTMLInputElement>(label, { exact: false })
}

function open(node: React.ReactNode, name: string) {
  render(<CsrfProvider token="t1">{node}</CsrfProvider>)
  fireEvent.click(screen.getByRole('button', { name }))
  return screen.getByRole('dialog')
}

function group(name: string): HTMLElement {
  return screen.getByRole('group', { name })
}

describe('notice contact dialogs', () => {
  it('opens an association with one row per officer, filled in', () => {
    const dialog = open(
      <EditAssociation row={association} today="2026-11-04" />,
      'Edit Heron Landing',
    )
    expect(field('Association name').value).toBe('Heron Landing')
    expect(field('List current as of').value).toBe('2026-10-01')
    expect(field('Name', group('Officer 1')).value).toBe('Dana Whitcomb')
    expect(field('Title', group('Officer 2')).value).toBe('Treasurer')
    expect(field('Mailing address', group('Officer 2')).value).toBe('12 Loon Road, Alder Pond NH')
    expect(dialog.querySelector<HTMLInputElement>('input[name="parcelId"]')?.value).toBe(
      association.parcelId,
    )
  })

  it('adds and removes officer rows', () => {
    open(<EditAssociation row={association} today="2026-11-04" />, 'Edit Heron Landing')
    fireEvent.click(screen.getByRole('button', { name: 'Add another officer' }))
    expect(field('Name', group('Officer 3')).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Remove officer 1' }))
    expect(field('Name', group('Officer 1')).value).toBe('Lee Marsh')
    expect(screen.queryByRole('group', { name: 'Officer 3' })).toBeNull()
  })

  it('opens a park with its tenants, keeping each tenant id', () => {
    const dialog = open(<EditPark row={park} today="2026-11-04" />, 'Edit Loon Cove')
    expect(field('Owner mailing address').value).toBe(park.ownerMailingAddress)
    expect(field('Site', group('Tenant 1')).value).toBe('Site 4')
    expect(dialog.querySelector<HTMLInputElement>('input[name="tenantId"]')?.value).toBe('site-4')
  })

  it('opens a holder with its kind chosen', () => {
    open(<EditHolder row={holding} />, 'Edit Alder Pond Land Trust on 021-004')
    expect(screen.getByLabelText<HTMLSelectElement>('Kind').value).toBe('preservation')
    expect(field('Where it is recorded').value).toBe('Book 1 Page 2')
  })

  it('ends a holder on a chosen date, today by default', () => {
    open(<EndHolder row={holding} today="2026-11-04" />, 'End Alder Pond Land Trust on 021-004')
    expect(field('End on').value).toBe('2026-11-04')
    expect(screen.getByRole('button', { name: 'End restriction' })).toBeTruthy()
  })

  it('adds an association with an empty parcel field and one blank officer', () => {
    open(<AddAssociation today="2026-11-04" />, 'Add association')
    expect(field('Parcel of the condominium').value).toBe('')
    expect(field('List current as of').value).toBe('2026-11-04')
    expect(field('Name', group('Officer 1')).value).toBe('')
  })

  it('opens Add already filled in with the parcel when asked', () => {
    render(
      <CsrfProvider token="t1">
        <AddAssociation
          today="2026-11-04"
          open
          parcel={{
            parcelId: association.parcelId,
            displayId: '021-004',
            status: 'active',
            siteAddress: '4 Heron Way',
            ownerName: null,
          }}
        />
      </CsrfProvider>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('021-004')
    expect(dialog.querySelector<HTMLInputElement>('input[name="parcelRef"]')?.value).toBe(
      association.parcelId,
    )
  })
})
