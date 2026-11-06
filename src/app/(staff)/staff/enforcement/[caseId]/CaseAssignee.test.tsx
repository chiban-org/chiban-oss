// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { openSection, renderForm } from '@/test/enforcementRender'

vi.mock('../assignActions', () => ({ reassignCaseAction: vi.fn() }))

const { CaseAssignee } = await import('./CaseAssignee')
const { reassignCaseAction } = await import('../assignActions')

afterEach(cleanup)

describe('reassigning a case', () => {
  it('shows a refused assignee beside the assignee field', async () => {
    const message = 'Choose someone whose role works code enforcement cases.'
    vi.mocked(reassignCaseAction).mockResolvedValue(refusal('userId', message))
    renderForm(
      <CaseAssignee
        caseId="c1"
        canManage
        data={{ current: null, choices: [{ id: 'u1', name: 'Pat Planner' }] }}
      />,
    )
    openSection('Reassign the case')
    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }))
    await expectRefusalBeside(screen.getByLabelText(/^Assign to/), message)
  })
})
