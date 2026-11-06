// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, it, vi } from 'vitest'
import { AddressTextField } from '@/components/address/AddressTextField'
import { CsrfProvider } from '@/components/CsrfProvider'
import { FieldErrorsProvider } from '@/components/fieldErrors'
import { ParcelMultiPickerView } from '@/components/parcels/picker/ParcelMultiPickerView'
import { ParcelPickerView } from '@/components/parcels/picker/ParcelPickerView'
import type { gisLayers, importExceptions } from '@/db/schema'
import type { CensusSuggestion } from '@/features/census/suggest'
import { expectGroupRefusal, expectRefusalBeside } from '@/test/besideField'

const refusal = vi.hoisted(() => ({ field: '', message: '' }))
const answer = vi.hoisted(
  () => () =>
    Promise.resolve({
      ok: false as const,
      error: refusal.message,
      fieldErrors: { [refusal.field]: refusal.message },
    }),
)

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/parcels/picker/staffParcelSearch', () => ({
  staffParcelSearch: () => Promise.resolve([]),
}))
vi.mock('./gis/imports/actions', () => ({ updateLayerSettingsAction: answer }))
vi.mock('./gis/exceptions/actions', () => ({
  acceptHeldRowAction: answer,
  dismissExceptionAction: answer,
}))
vi.mock('./reports/census/actions', () => ({ classifyCensusAction: answer }))
vi.mock('./parcels/[parcelId]/actions', () => ({
  recordLineageAction: answer,
  createAliasOverrideAction: answer,
  carryForwardAction: answer,
  resolveUnresolvedAction: answer,
}))

const { LayerSettingsForm } = await import('./gis/imports/LayerSettingsForm')
const { ExceptionRow } = await import('./gis/exceptions/ExceptionRow')
const { ClassifyForm } = await import('./reports/census/ClassifyForm')
const { LineageForm } = await import('./parcels/lineage/new/LineageForm')
const { ParcelIds } = await import('./parcels/[parcelId]/ParcelIds')

afterEach(cleanup)

function inProvider(node: ReactNode) {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
}

function refuseWith(field: string, message: string) {
  refusal.field = field
  refusal.message = message
}

const layer = {
  key: 'parcels',
  adapter: 'esri_rest',
  sourceUrl: 'https://gis.alderpond.example/layer',
  mapping: {},
  staleAfterDays: 90,
  refreshIntervalHours: 24,
} as unknown as typeof gisLayers.$inferSelect

describe('layer, exception and census forms show a refusal beside their field', () => {
  it('the layer mapping', async () => {
    const message = 'The mapping is not valid JSON for this layer.'
    refuseWith('mapping', message)
    inProvider(<LayerSettingsForm layer={layer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await expectRefusalBeside(screen.getByRole('textbox', { name: /Field mapping/ }), message)
  })

  it('the layer source address', async () => {
    const message = 'Enter the source address starting with https://.'
    refuseWith('sourceUrl', message)
    inProvider(<LayerSettingsForm layer={layer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await expectRefusalBeside(screen.getByLabelText(/^Source URL/), message)
  })

  it('the dismissal reason', async () => {
    refuseWith('reason', 'Enter a reason.')
    const row = {
      id: 'e1',
      kind: 'owner_changed',
      rowKey: 'parcel:1',
      detail: 'x',
      payload: {},
      createdAt: new Date('2026-11-01T10:00:00Z'),
      status: 'open',
      dispositionReason: null,
    } as unknown as typeof importExceptions.$inferSelect
    inProvider(<ExceptionRow row={row} timeZone="America/New_York" canManage />)
    fireEvent.click(screen.getByText('Dismiss', { selector: 'summary' }))
    const reason = screen.getByRole('textbox', { name: /^Reason/ })
    fireEvent.change(reason, { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await expectRefusalBeside(reason, 'Enter a reason.')
  })

  it('the housing units on a census classification', async () => {
    const message = 'The housing units do not fit that kind of structure.'
    refuseWith('housingUnits', message)
    const suggestion = {
      category: 'single_family',
      excludedReason: null,
      phase: 'whole_building',
      buildings: 1,
      housingUnits: 3,
      valuationDollars: 350000,
    } as unknown as CensusSuggestion
    inProvider(<ClassifyForm applicationId="a1" suggestion={suggestion} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save classification' }))
    await expectRefusalBeside(screen.getByLabelText(/^Housing units/), message)
  })
})

describe('parcel forms show a refusal beside their field', () => {
  it('the child parcels on a lineage event', async () => {
    const message =
      'FSC-NEW-1 is not an existing parcel, and it is not a new parcel ID in the right shape.'
    refuseWith('children', message)
    inProvider(<LineageForm parents={[{ kind: 'raw', value: '007001000000' }]} childHint="Hint." />)
    fireEvent.change(screen.getByLabelText(/^Effective date/), { target: { value: '2026-05-01' } })
    const children = screen.getByRole('combobox', { name: /Child parcels/ })
    fireEvent.change(children, { target: { value: 'FSC-NEW-1' } })
    fireEvent.click(await screen.findByRole('option', { name: /Use this ID anyway/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record lineage event' }))
    await expectRefusalBeside(screen.getByRole('combobox', { name: /Child parcels/ }), message)
  })

  it('the ID value on a parcel override', async () => {
    const message = 'The ID does not match the selected format.'
    refuseWith('value', message)
    inProvider(<ParcelIds aliases={[]} displayId="007001000000" canManage />)
    fireEvent.click(screen.getByText('Override an ID', { selector: 'summary' }))
    fireEvent.change(screen.getByLabelText(/^Format key/), { target: { value: 'cama15' } })
    const value = screen.getByLabelText(/^ID value/)
    fireEvent.change(value, { target: { value: '12345' } })
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Typo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save override' }))
    await expectRefusalBeside(value, message)
  })

  it('a parcel picker, with its label showing or hidden', async () => {
    const message = 'Choose a parcel from the list.'
    render(
      <FieldErrorsProvider errors={{ parcelRef: message }}>
        <ParcelPickerView
          name="parcelRef"
          label="Points to parcel"
          search={() => Promise.resolve([])}
        />
      </FieldErrorsProvider>,
    )
    await expectRefusalBeside(screen.getByRole('combobox', { name: 'Points to parcel' }), message)
    cleanup()
    render(
      <form>
        <FieldErrorsProvider errors={{ parcelRef: message }}>
          <ParcelPickerView
            name="parcelRef"
            label="Parcel for record"
            labelHidden
            search={() => Promise.resolve([])}
          />
        </FieldErrorsProvider>
      </form>,
    )
    await expectGroupRefusal(screen.getByRole('combobox', { name: 'Parcel for record' }), message)
  })

  it('a multi parcel picker', async () => {
    const message = 'No parcel found for 999999999999.'
    render(
      <FieldErrorsProvider errors={{ parents: message }}>
        <ParcelMultiPickerView
          name="parents"
          label="Parent parcels"
          search={() => Promise.resolve([])}
        />
      </FieldErrorsProvider>,
    )
    await expectRefusalBeside(screen.getByRole('combobox', { name: 'Parent parcels' }), message)
  })

  it('the requester contact address field', async () => {
    const message = 'Enter the requester contact of 300 characters or fewer.'
    render(
      <FieldErrorsProvider errors={{ requesterContact: message }}>
        <AddressTextField label="Requester email, phone, or address" name="requesterContact" />
      </FieldErrorsProvider>,
    )
    await expectRefusalBeside(screen.getByLabelText(/^Requester email/), message)
  })
})
