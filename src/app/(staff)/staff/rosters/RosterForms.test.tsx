// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { RostersView } from '@/features/rosters/rosterView'

vi.mock('./rosterActions', () => ({
  addAssociationAction: vi.fn(),
  addParkAction: vi.fn(),
  updateAssociationAction: vi.fn(),
  updateParkAction: vi.fn(),
}))
vi.mock('./actions', () => ({
  addRestrictionAction: vi.fn(),
  updateRestrictionAction: vi.fn(),
}))

const { AddAssociation, EditAssociation, EditHolder, EditPark } = await import('./RosterForms')

afterEach(cleanup)

const association: RostersView['associations'][number] = {
  parcelId: '7d3f6a4e-0c2b-4a51-9d1e-3f2b8c6a9e10',
  parcel: '021-004',
  name: 'Heron Landing',
  officers: ['Dana Whitcomb, President'],
  officersText: 'Dana Whitcomb | President | PO Box 105, Alder Pond NH 03999',
  asOf: '2026-10-01',
  asOfText: 'October 1, 2026',
}

const park: RostersView['parks'][number] = {
  parcelId: '9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
  parcel: '021-005',
  name: 'Loon Cove',
  owner: 'Loon Cove LLC',
  ownerMailingAddress: '1 Cove Road, Alder Pond NH 03999',
  tenants: ['Rory Pike, Site 4'],
  tenantsText: 'Rory Pike | Site 4 | 4 Merganser Court, Alder Pond NH 03999',
  asOf: '2026-09-15',
  asOfText: 'September 15, 2026',
}

const holding: RostersView['restrictions'][number] = {
  id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  parcelId: association.parcelId,
  parcel: '021-004',
  holder: 'Alder Pond Land Trust',
  holderMailingAddress: '1 Trust Way, Alder Pond NH 03999',
  kind: 'preservation',
  kindText: 'Preservation easement',
  reference: 'Book 1 Page 2',
  endedText: null,
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(label, { exact: false })
}

function open(node: React.ReactNode, name: string) {
  render(<CsrfProvider token="t1">{node}</CsrfProvider>)
  fireEvent.click(screen.getByRole('button', { name }))
  return screen.getByRole('dialog')
}

describe('roster Edit dialogs', () => {
  it('opens the association roster filled in with what is on file', () => {
    const dialog = open(
      <EditAssociation row={association} today="2026-11-04" />,
      'Edit Heron Landing roster',
    )
    expect(field('Association name').value).toBe('Heron Landing')
    expect(field('Roster current as of').value).toBe('2026-10-01')
    expect(field('Officers, one per line').value).toBe(association.officersText)
    expect(dialog.querySelector<HTMLInputElement>('input[name="parcelId"]')?.value).toBe(
      association.parcelId,
    )
    expect(dialog.textContent).toContain('Parcel 021-004')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
  })

  it('opens the park roster filled in, owner and tenants included', () => {
    open(<EditPark row={park} today="2026-11-04" />, 'Edit Loon Cove roster')
    expect(field('Owner mailing address').value).toBe(park.ownerMailingAddress)
    expect(field('Tenants, one per line').value).toBe(park.tenantsText)
  })

  it('opens a holder with its kind chosen', () => {
    open(<EditHolder row={holding} />, 'Edit Alder Pond Land Trust on 021-004')
    expect(screen.getByLabelText<HTMLSelectElement>('Kind').value).toBe('preservation')
    expect(field('Where it is recorded').value).toBe('Book 1 Page 2')
  })

  it('adds a roster from an empty form that asks for the parcel', () => {
    const dialog = open(<AddAssociation today="2026-11-04" />, 'Add association')
    expect(field('Parcel ID of the condominium').value).toBe('')
    expect(field('Roster current as of').value).toBe('2026-11-04')
    expect(dialog.textContent).toContain('use Edit on its row')
  })
})
