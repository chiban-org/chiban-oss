// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { WorkflowEditor } from '@/components/config/WorkflowEditor'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { boardTypeBody } from '@/test/boardFixtures'

afterEach(cleanup)

const BOARD = {
  label: 'Variance',
  directIssueAllowed: false,
  requiredSubsteps: [{ state: 'under_review' as const, key: 'hearing' }],
}
const PERMIT = { label: 'Building permit', directIssueAllowed: true, requiredSubsteps: [] }

function renderEditor(body: ApplicationTypeBody, classification = BOARD) {
  render(
    <CsrfProvider token="t1">
      <WorkflowEditor
        typeKey="VAR"
        initialBody={body}
        classification={classification}
        saveAction={vi.fn()}
        publishAction={vi.fn()}
        previewAction={vi.fn()}
      />
    </CsrfProvider>,
  )
}

const variance = () => boardTypeBody('nh.zba_variance', 'VAR', 'VAR')

function hiddenBody(): { workflow: ApplicationTypeBody['workflow'] } {
  const input = document.querySelector<HTMLInputElement>('input[name="body"]')
  return JSON.parse(input?.value ?? '{}') as { workflow: ApplicationTypeBody['workflow'] }
}

describe('WorkflowEditor', () => {
  it('lists the steps under each state', () => {
    renderEditor(variance())
    expect(
      screen.getAllByLabelText('Step name').map((i) => (i as HTMLInputElement).value),
    ).toContain('Hearing')
  })

  it('hides the direct issue toggle for a board proceeding and says why', () => {
    renderEditor(variance())
    expect(screen.queryByLabelText('Staff may issue directly at the counter')).toBeNull()
    expect(screen.getByText('This kind of proceeding always goes through the board.')).toBeTruthy()
  })

  it('shows the direct issue toggle for a permit', () => {
    renderEditor(boardTypeBody('nh.zba_variance', 'VAR', 'VAR'), PERMIT)
    expect(screen.getByLabelText('Staff may issue directly at the counter')).toBeTruthy()
  })

  it('adding a step puts it in the posted body', () => {
    renderEditor(variance())
    const before = hiddenBody().workflow.substeps.length
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a step' })[0] as HTMLElement)
    expect(hiddenBody().workflow.substeps.length).toBe(before + 1)
  })

  it('removing the hearing step shows the issue beside its state in words', () => {
    renderEditor(variance())
    const row = screen
      .getAllByLabelText('Step name')
      .findIndex((i) => (i as HTMLInputElement).value === 'Hearing')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[row] as HTMLElement)
    expect(screen.getByRole('alert').textContent).toBe(
      'Under review needs a Hearing step for this kind of proceeding.',
    )
  })

  it('renaming a step derives its key from the name', () => {
    renderEditor(variance())
    const input = screen
      .getAllByLabelText('Step name')
      .find((i) => (i as HTMLInputElement).value === 'Deliberation') as HTMLElement
    fireEvent.change(input, { target: { value: 'Site walk' } })
    expect(
      hiddenBody().workflow.substeps.some((s) => s.key === 'site_walk' && s.label === 'Site walk'),
    ).toBe(true)
  })

  it('moving a step down reorders it', () => {
    renderEditor(variance())
    const labels = () =>
      hiddenBody()
        .workflow.substeps.filter((s) => s.state === 'under_review')
        .map((s) => s.label)
    expect(labels()).toEqual(['Hearing', 'Deliberation'])
    const hearingRow = screen
      .getAllByLabelText('Step name')
      .findIndex((i) => (i as HTMLInputElement).value === 'Hearing')
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[hearingRow] as HTMLElement)
    expect(labels()).toEqual(['Deliberation', 'Hearing'])
  })

  it('offers publish, save draft, and preview with publish as the one filled action', () => {
    renderEditor(variance())
    const publish = screen.getByRole('button', { name: 'Publish' })
    expect(publish.getAttribute('data-variant')).not.toBe('outline')
    expect(screen.getByRole('button', { name: 'Save draft' }).getAttribute('data-variant')).toBe(
      'outline',
    )
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('data-variant')).toBe(
      'outline',
    )
  })
})
