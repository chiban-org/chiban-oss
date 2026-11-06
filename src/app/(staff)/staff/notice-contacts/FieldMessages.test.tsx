// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { AssociationRow, HoldingRow, ParkRow } from '@/features/rosters/contactRows'
import { expectRefusalAfterSubmit, expectRefusalBeside } from '@/test/besideField'

const refusal = vi.hoisted(() => ({ field: '', message: '' }))
const answer = vi.hoisted(
  () => () =>
    Promise.resolve({
      ok: false as const,
      error: refusal.message,
      fieldErrors: { [refusal.field]: refusal.message },
    }),
)

vi.mock('./rosterActions', () => ({
  addAssociationAction: answer,
  addParkAction: answer,
  updateAssociationAction: answer,
  updateParkAction: answer,
}))
vi.mock('./actions', () => ({
  addRestrictionAction: answer,
  updateRestrictionAction: answer,
  endRestrictionAction: answer,
  undoRestrictionEndAction: answer,
}))
vi.mock('./rosterEndActions', () => ({ endRosterEntryAction: answer, undoRosterEndAction: answer }))
vi.mock('./intervalActions', () => ({ changeRecheckIntervalAction: answer }))
vi.mock('@/components/parcels/picker/ParcelPicker', async () => {
  const { TextField } = await import('@/components/staff/fields')
  return {
    ParcelPicker: ({ label, name }: { label: string; name: string }) => (
      <TextField label={label} name={name} required />
    ),
  }
})

const { AddAssociation, EditAssociation } = await import('./AssociationForms')
const { AddPark, EditPark } = await import('./ParkForms')
const { AddHolder, EditHolder, EndHolder } = await import('./HolderForms')
const { EndEntry } = await import('./EndForms')
const { RecheckInterval } = await import('./RecheckInterval')

afterEach(cleanup)

const meta = {
  checkedText: 'Checked October 1, 2026',
  due: false,
  uses: [],
  versions: [],
  statusText: 'Active',
  endedOn: null,
  active: true,
  undoable: false,
}

const association = {
  ...meta,
  entryId: '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  parcelId: '7d3f6a4e-0c2b-4a51-9d1e-3f2b8c6a9e10',
  parcel: '021-004',
  name: 'Heron Landing',
  officers: [{ name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105' }],
  asOf: '2026-10-01',
} as AssociationRow

const park = {
  ...meta,
  entryId: '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a',
  parcelId: '9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
  parcel: '021-005',
  name: 'Loon Cove',
  owner: 'Loon Cove LLC',
  ownerMailingAddress: '1 Cove Road',
  tenants: [
    { tenantId: 'site-4', name: 'Rory Pike', siteLabel: 'Site 4', mailingAddress: '4 Court' },
  ],
  asOf: '2026-09-15',
} as ParkRow

const holding = {
  ...meta,
  entryId: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  parcelId: association.parcelId,
  parcel: '021-004',
  holder: 'Alder Pond Land Trust',
  holderMailingAddress: '1 Trust Way',
  kind: 'preservation',
  kindText: 'Preservation easement',
  reference: 'Book 1 Page 2',
} as HoldingRow

function refuseWith(field: string, message: string) {
  refusal.field = field
  refusal.message = message
}

function openDialog(node: ReactNode, opener: string): HTMLElement {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
  fireEvent.click(screen.getByRole('button', { name: opener }))
  return screen.getByRole('dialog')
}

async function refused(dialog: HTMLElement, submit: string, label: RegExp, message: string) {
  for (const input of dialog.querySelectorAll<HTMLInputElement>('input:not([type=hidden])')) {
    if (input.value === '') {
      fireEvent.change(input, { target: { value: input.type === 'date' ? '2026-11-01' : 'x' } })
    }
  }
  fireEvent.click(within(dialog).getByRole('button', { name: submit }))
  await expectRefusalBeside(within(dialog).getByLabelText(label), message)
}

describe('refusals beside the field in the notice contact forms', () => {
  it('shows a refused association name when adding an association', async () => {
    refuseWith('associationName', 'Enter the association name.')
    const dialog = openDialog(<AddAssociation today="2026-11-04" />, 'Add association')
    await refused(dialog, 'Add association', /^Association name/, 'Enter the association name.')
  })

  it('shows a refused list date when editing an association', async () => {
    refuseWith(
      'asOf',
      'Enter the date the list is current between January 1, 1900 and November 6, 2026.',
    )
    const dialog = openDialog(
      <EditAssociation row={association} today="2026-11-04" />,
      'Edit Heron Landing',
    )
    await refused(
      dialog,
      'Save changes',
      /^List current as of/,
      'Enter the date the list is current between January 1, 1900 and November 6, 2026.',
    )
  })

  it('shows a refused park name when adding a park', async () => {
    refuseWith('parkName', 'Enter the park name.')
    const dialog = openDialog(<AddPark today="2026-11-04" />, 'Add park')
    await refused(dialog, 'Add park', /^Park name/, 'Enter the park name.')
  })

  it('shows a refused owner address when editing a park', async () => {
    refuseWith('ownerMailingAddress', 'Enter the owner mailing address.')
    const dialog = openDialog(<EditPark row={park} today="2026-11-04" />, 'Edit Loon Cove')
    await refused(
      dialog,
      'Save changes',
      /^Owner mailing address/,
      'Enter the owner mailing address.',
    )
  })

  it('shows a refused reference when adding a holder', async () => {
    refuseWith('recordedReference', 'Enter where it is recorded.')
    const dialog = openDialog(<AddHolder />, 'Add holder')
    await refused(dialog, 'Add holder', /^Where it is recorded/, 'Enter where it is recorded.')
  })

  it('shows a refused holder address when editing a holder', async () => {
    refuseWith('holderMailingAddress', 'Enter the holder mailing address.')
    const dialog = openDialog(<EditHolder row={holding} />, 'Edit Alder Pond Land Trust on 021-004')
    await refused(
      dialog,
      'Save changes',
      /^Holder mailing address/,
      'Enter the holder mailing address.',
    )
  })

  it('shows a refused end date when ending a holder', async () => {
    refuseWith('endedOn', 'Enter the end date between January 1, 1900 and November 6, 2026.')
    const dialog = openDialog(
      <EndHolder row={holding} today="2026-11-04" />,
      'End Alder Pond Land Trust on 021-004',
    )
    await refused(
      dialog,
      'End restriction',
      /^End on/,
      'Enter the end date between January 1, 1900 and November 6, 2026.',
    )
  })

  it('shows a refused end date when ending an association', async () => {
    refuseWith('endedOn', 'The end date cannot be before the date the list is current.')
    const dialog = openDialog(
      <EndEntry
        row={{ entryId: association.entryId, name: 'Heron Landing', parcel: '021-004' }}
        kind="association"
        today="2026-11-04"
      />,
      'End Heron Landing on 021-004',
    )
    await refused(
      dialog,
      'End association',
      /^End on/,
      'The end date cannot be before the date the list is current.',
    )
  })

  it('shows a refused number of days when changing the check interval', async () => {
    refuseWith('days', 'Enter the number of days as a whole number from 1 to 3650.')
    render(
      <CsrfProvider token="t">
        <RecheckInterval days={365} canEdit />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    const dialog = screen.getByRole('dialog')
    await expectRefusalAfterSubmit(
      within(dialog).getByRole('button', { name: 'Publish' }),
      () => within(dialog).getByLabelText(/^Days between checks/),
      'Enter the number of days as a whole number from 1 to 3650.',
    )
  })
})
