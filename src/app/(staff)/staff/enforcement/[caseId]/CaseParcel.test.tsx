// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import {
  ALL_CAN,
  fillField,
  labelled,
  openSection,
  renderForm,
  stubDetail,
} from '@/test/enforcementRender'

vi.mock('../actions', () => ({ setCaseParcelAction: vi.fn() }))
vi.mock('@/components/parcels/picker/ParcelPicker', async () => {
  const { TextField } = await import('@/components/staff/fields')
  return {
    ParcelPicker: ({ label, name }: { label: string; name: string }) => (
      <TextField label={label} name={name} required />
    ),
  }
})

const { CaseParcel } = await import('./CaseParcel')
const { setCaseParcelAction } = await import('../actions')

afterEach(cleanup)

describe('linking a parcel', () => {
  it('shows a refused parcel beside the parcel field', async () => {
    const message = 'No parcel has that number or site address. Check it on the parcel page.'
    vi.mocked(setCaseParcelAction).mockResolvedValue(refusal('parcelRef', message))
    renderForm(<CaseParcel detail={stubDetail()} can={ALL_CAN} />)
    openSection('Link a parcel')
    fillField(labelled('Parcel'), 'nowhere')
    fireEvent.click(screen.getByRole('button', { name: 'Link the case to a parcel' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Parcel')), message)
  })
})
