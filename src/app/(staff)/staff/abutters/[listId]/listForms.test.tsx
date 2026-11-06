// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ListView } from '@/features/abutters/listView'
import { expectRefusalBeside } from '@/test/besideField'

const refusal = vi.hoisted(() => ({ field: '', message: '' }))
const answer = vi.hoisted(
  () => () =>
    Promise.resolve({
      ok: false as const,
      error: refusal.message,
      fieldErrors: { [refusal.field]: refusal.message },
    }),
)

vi.mock('../actions', () => ({
  attestCrossingsAction: answer,
  correctRecipientAction: answer,
  decideTenantAction: answer,
  excludeCandidateAction: answer,
  selectParcelAction: answer,
  issueListAction: answer,
}))
vi.mock('@/components/parcels/picker/ParcelPicker', async () => {
  const { TextField } = await import('@/components/staff/fields')
  return {
    ParcelPicker: ({ label, name }: { label: string; name: string }) => (
      <TextField label={label} name={name} required />
    ),
  }
})

const { CandidatesSection, RecipientsSection } = await import('./listSections')

afterEach(cleanup)

function renderIn(node: ReactNode) {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
}

function refuseWith(field: string, message: string) {
  refusal.field = field
  refusal.message = message
}

const view = {
  listId: '2f6c8e1a-3b4d-4e5f-8a7b-9c0d1e2f3a4b',
  canEdit: true,
  attestedText: null,
  candidates: [
    {
      parcelId: '3a4b5c6d-7e8f-4a1b-9c2d-3e4f5a6b7c8d',
      parcelLabel: '009011000000',
      owner: 'Heron, Ada',
      ownerOnRecord: true,
      noticeTo: 'Heron, Ada',
      reasons: ['Adjoins the property'],
      staffSelected: false,
      excluded: false,
      exclusionReason: null,
    },
  ],
  recipients: [
    {
      id: '4b5c6d7e-8f9a-4b2c-8d3e-4f5a6b7c8d9e',
      name: 'Wren, Isolde',
      mailingAddress: '4 Heron Way',
      roles: ['Owner'],
      statusText: 'Needs a decision',
      provenance: [],
      excluded: false,
      exclusionReason: null,
      needsDecision: true,
      tenantDecided: false,
      decisionText: null,
      corrected: false,
    },
  ],
} as unknown as ListView

async function refused(form: HTMLElement, submit: string, label: RegExp, message: string) {
  for (const input of form.querySelectorAll<HTMLInputElement>('input:not([type=hidden])')) {
    fireEvent.change(input, { target: { value: 'x' } })
  }
  for (const area of form.querySelectorAll<HTMLTextAreaElement>('textarea')) {
    fireEvent.change(area, { target: { value: 'x' } })
  }
  fireEvent.click(within(form).getByRole('button', { name: submit }))
  await expectRefusalBeside(within(form).getByLabelText(label), message)
}

const formWith = (submit: string) =>
  screen.getByRole('button', { name: submit }).closest('form') as HTMLElement

describe('abutter list forms', () => {
  it('shows a refused reason beside the reason field when leaving a parcel off', async () => {
    refuseWith('reason', 'Enter a reason.')
    renderIn(<CandidatesSection view={view} />)
    await refused(
      formWith('Leave off the list'),
      'Leave off the list',
      /^Reason/,
      'Enter a reason.',
    )
  })

  it('shows a refused parcel beside the parcel field when adding a parcel across', async () => {
    refuseWith('parcelRef', 'That parcel ID was not found.')
    renderIn(<CandidatesSection view={view} />)
    await refused(formWith('Add parcel'), 'Add parcel', /^Parcel/, 'That parcel ID was not found.')
  })

  it('shows a refused name beside the name field when correcting a recipient', async () => {
    refuseWith('name', 'Enter the name of 200 characters or fewer.')
    renderIn(<RecipientsSection view={view} />)
    await refused(
      formWith('Save correction'),
      'Save correction',
      /^Name/,
      'Enter the name of 200 characters or fewer.',
    )
  })

  it('shows a refused reason beside the reason field when deciding a tenant', async () => {
    refuseWith('reason', 'Enter a reason.')
    renderIn(<RecipientsSection view={view} />)
    await refused(formWith('Record decision'), 'Record decision', /^Reason/, 'Enter a reason.')
  })

  it('shows a refused note beside the note field when adding a parcel across', async () => {
    refuseWith('note', 'Enter why this parcel belongs on the list.')
    renderIn(<CandidatesSection view={view} />)
    await refused(
      formWith('Add parcel'),
      'Add parcel',
      /^Why it belongs on the list/,
      'Enter why this parcel belongs on the list.',
    )
  })
})
