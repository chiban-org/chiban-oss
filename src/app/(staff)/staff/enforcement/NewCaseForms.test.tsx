// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { fillField, labelled, renderForm } from '@/test/enforcementRender'

vi.mock('./actions', () => ({ openCaseAction: vi.fn(), staffComplaintAction: vi.fn() }))
vi.mock('@/components/parcels/picker/ParcelPicker', async () => {
  const { TextField } = await import('@/components/staff/fields')
  return {
    ParcelPicker: ({ label, name }: { label: string; name: string }) => (
      <TextField label={label} name={name} />
    ),
  }
})

const { NewCaseForms } = await import('./NewCaseForms')
const { openCaseAction, staffComplaintAction } = await import('./actions')

afterEach(cleanup)

describe('opening a case', () => {
  it('shows a refused location beside the location field', async () => {
    vi.mocked(openCaseAction).mockResolvedValue(
      refusal('locationText', 'Enter where the property is of 300 characters or fewer.'),
    )
    renderForm(<NewCaseForms />)
    fireEvent.click(screen.getByRole('button', { name: 'Open a case' }))
    fillField(labelled('Where is the property?'), 'x')
    fireEvent.click(screen.getByRole('button', { name: 'Open case' }))
    await expectRefusalBeside(
      screen.getByLabelText(labelled('Where is the property?')),
      'Enter where the property is of 300 characters or fewer.',
    )
  })

  it('shows a refused parcel beside the parcel field', async () => {
    vi.mocked(openCaseAction).mockResolvedValue(
      refusal(
        'parcelRef',
        'No parcel has that number or site address. Check it on the parcel page.',
      ),
    )
    renderForm(<NewCaseForms />)
    fireEvent.click(screen.getByRole('button', { name: 'Open a case' }))
    fillField(labelled('Where is the property?'), 'x')
    fireEvent.click(screen.getByRole('button', { name: 'Open case' }))
    await expectRefusalBeside(
      screen.getByLabelText(labelled('Parcel, if known')),
      'No parcel has that number or site address. Check it on the parcel page.',
    )
  })
})

describe('entering a complaint', () => {
  it('shows a refused description beside the description field', async () => {
    vi.mocked(staffComplaintAction).mockResolvedValue(
      refusal('description', 'Enter what was reported of 5000 characters or fewer.'),
    )
    renderForm(<NewCaseForms />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter a complaint' }))
    fillField(labelled('Where is the property?'), 'x')
    fillField(labelled('What was reported?'), 'y')
    fireEvent.click(screen.getByRole('button', { name: 'Record complaint' }))
    await expectRefusalBeside(
      screen.getByLabelText(labelled('What was reported?')),
      'Enter what was reported of 5000 characters or fewer.',
    )
  })
})
