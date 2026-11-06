// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { BoardPanelData } from '@/features/boards/panelData'
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

vi.mock('../../abutters/actions', () => ({
  generateListAction: answer,
  addProfessionalAction: answer,
}))
vi.mock('../../boards/actions', () => ({ addApplicantParcelAction: answer }))
vi.mock('@/components/parcels/picker/ParcelPicker', async () => {
  const { TextField } = await import('@/components/staff/fields')
  return {
    ParcelPicker: ({ label, name }: { label: string; name: string }) => (
      <TextField label={label} name={name} />
    ),
  }
})

const { ListSection } = await import('./boardPanelSections')

afterEach(cleanup)

const data = {
  applicationId: '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f',
  canManage: true,
  canOpenLists: false,
  parcels: [],
  lists: [],
  professionals: [],
} as unknown as BoardPanelData

describe('professional form on the abutter lists panel', () => {
  it('shows a refused business address beside the address field', async () => {
    refusal.field = 'businessAddress'
    refusal.message = 'Enter the business address.'
    render(
      <CsrfProvider token="t">
        <ListSection data={data} />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Casey Marsh' } })
    fireEvent.change(screen.getByLabelText(/^Business address/), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add professional' }))
    await expectRefusalBeside(
      screen.getByLabelText(/^Business address/),
      'Enter the business address.',
    )
  })
})
