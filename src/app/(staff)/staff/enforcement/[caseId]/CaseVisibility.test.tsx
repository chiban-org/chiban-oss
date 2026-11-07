// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { ALL_CAN, fillField, openSection, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../publishActions', () => ({
  publishCaseAction: vi.fn(),
  unpublishCaseAction: vi.fn(),
}))

const { CaseVisibility } = await import('./CaseVisibility')
const { publishCaseAction } = await import('../publishActions')

afterEach(cleanup)

const publicDetail = () =>
  stubDetail({
    staff: {
      ...stubDetail().staff,
      row: { ...stubDetail().staff.row, isPublic: true, publicSummary: 'Unpermitted rental.' },
    },
  })

describe('making a case public from the rail', () => {
  it('shows a refused summary beside the summary field', async () => {
    const message = 'Enter a public summary of 1000 characters or fewer.'
    vi.mocked(publishCaseAction).mockResolvedValue(refusal('summary', message))
    renderForm(<CaseVisibility detail={stubDetail()} can={ALL_CAN} />)
    openSection('Show the case on the public site')
    fillField(/^Public summary/, 'Something')
    fireEvent.click(screen.getByRole('button', { name: 'Show the case on the public site' }))
    await expectRefusalBeside(screen.getByLabelText(/^Public summary/), message)
  })

  it('says the public page for the parcel shows the case', () => {
    renderForm(<CaseVisibility detail={stubDetail()} can={ALL_CAN} />)
    openSection('Show the case on the public site')
    expect(screen.getByText(/^The public page for the parcel shows the case number/)).toBeTruthy()
  })

  it('names the visibility and offers to hide a public case', () => {
    renderForm(<CaseVisibility detail={publicDetail()} can={ALL_CAN} />)
    expect(
      screen.getByText('This case is shown on the public site. Summary: Unpermitted rental.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide the case from the public site' })).toBeTruthy()
  })

  it('only names the visibility to someone who cannot manage the case', () => {
    renderForm(<CaseVisibility detail={stubDetail()} can={{ ...ALL_CAN, manage: false }} />)
    expect(screen.getByText('Private to town staff')).toBeTruthy()
    expect(screen.queryByText('Show the case on the public site')).toBeNull()
  })
})
