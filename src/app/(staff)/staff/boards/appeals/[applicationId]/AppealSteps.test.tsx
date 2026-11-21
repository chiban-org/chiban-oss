// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { expectGroupRefusal, expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../../hearings/decisionActions', () => ({ addAppealNodeAction: vi.fn() }))

const { AppealSteps } = await import('./AppealSteps')
const { addAppealNodeAction } = await import('../../hearings/decisionActions')

afterEach(cleanup)

const choices = [{ id: 'n1', label: 'Administrative decision, March 1, 2027' }]

const LAST_APPROVAL = 'This is the last municipal approval the project needs'

function renderSteps(offerFinalApproval = false) {
  render(
    <CsrfProvider token="t">
      <AppealSteps
        nodeChoices={choices}
        today="2027-03-20"
        offerFinalApproval={offerFinalApproval}
      />
    </CsrfProvider>,
  )
}

describe('recording a step after an administrative decision', () => {
  it('starts with the appeal to the Zoning Board and asks who appealed', () => {
    renderSteps()
    const step = screen.getByLabelText<HTMLSelectElement>(/^Step( \*)?$/)
    expect(step.value).toBe('zba_appeal')
    expect(
      within(step)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Appeal to the Zoning Board',
      'Zoning Board decision',
      'Motion for rehearing',
      'Rehearing decision',
      'Court petition',
    ])
    expect(screen.getByLabelText(/^Who appealed( \*)?$/)).toBeTruthy()
  })

  it('shows a step that does not follow beside the Step field', async () => {
    vi.mocked(addAppealNodeAction).mockResolvedValue(
      refusal('kind', 'That step does not follow from the one you chose.'),
    )
    renderSteps()
    fireEvent.change(screen.getByLabelText(/^Step( \*)?$/), { target: { value: 'court_petition' } })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record the step' }),
      () => screen.getByLabelText(/^Step( \*)?$/),
      'That step does not follow from the one you chose.',
    )
  })

  it('asks whether the step is the last approval only when the pack waits for one', () => {
    renderSteps()
    expect(screen.queryByRole('checkbox', { name: LAST_APPROVAL })).toBeNull()
    cleanup()
    renderSteps(true)
    expect(screen.getByRole('checkbox', { name: LAST_APPROVAL })).toBeTruthy()
  })

  it('shows a project that is already final beside the last approval checkbox', async () => {
    const message =
      'The project already has its last municipal approval, recorded on another decision.'
    vi.mocked(addAppealNodeAction).mockResolvedValue(refusal('finalMunicipalApproval', message))
    renderSteps(true)
    fireEvent.click(screen.getByRole('button', { name: 'Record the step' }))
    await expectGroupRefusal(screen.getByRole('checkbox', { name: LAST_APPROVAL }), message)
  })
})
