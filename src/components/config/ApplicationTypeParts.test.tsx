// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationTypeEditor } from '@/components/config/ApplicationTypeEditor'
import { EditorContextProvider } from '@/components/config/EditorContextProvider'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { NO_REFERENCE_CHOICES } from '@/features/config/referenceChoices'
import { skeletonBody } from '@/features/config/skeletons'

afterEach(cleanup)

const TYPE: ApplicationTypeBody = {
  ...(skeletonBody('application_type', 'BP', 'Building permit') as ApplicationTypeBody),
  formKey: 'bp-form',
  checklistKeys: ['bp-final'],
  workflow: {
    allowsDirectIssue: false,
    closesOn: 'certificate_of_occupancy',
    substeps: [
      { state: 'under_review', key: 'plan_review', label: 'Plan review' },
      { state: 'under_review', key: 'zoning_review', label: 'Zoning review' },
    ],
  },
}

const context = {
  packRules: [],
  classifications: [],
  mergeFields: [],
  boards: [],
  reviewers: [],
  townRules: {},
  references: {
    ...NO_REFERENCE_CHOICES,
    form: [
      { key: 'bp-form', label: 'Building permit application' },
      { key: 'el-form', label: 'Electrical permit application' },
    ],
    inspection_checklist: [
      { key: 'bp-final', label: 'Final inspection', note: 'closes the permit' },
      { key: 'bp-footing', label: 'Footing inspection' },
    ],
  },
}

function renderEditor() {
  const onChange = vi.fn()
  render(
    <EditorContextProvider value={context}>
      <ApplicationTypeEditor
        body={TYPE}
        onChange={onChange}
        errors={{}}
        packRules={[]}
        classifications={[]}
      />
    </EditorContextProvider>,
  )
  return onChange
}

describe('application type references', () => {
  it('picks the form by name and stores its key', () => {
    const onChange = renderEditor()
    const form = screen.getByLabelText<HTMLSelectElement>('Application form')
    expect(form.selectedOptions[0]?.textContent).toBe('Building permit application')
    fireEvent.change(form, { target: { value: 'el-form' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ formKey: 'el-form' }))
  })

  it('ticks checklists by name and marks the final inspection', () => {
    const onChange = renderEditor()
    fireEvent.click(screen.getByLabelText('Footing inspection'))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ checklistKeys: ['bp-final', 'bp-footing'] }),
    )
    expect(screen.getByLabelText('Final inspection (closes the permit)')).toBeTruthy()
  })

  it('summarises the workflow in words and links to the step editor', () => {
    renderEditor()
    expect(screen.getByText('Under review: Plan review, Zoning review')).toBeTruthy()
    expect(screen.getByText('Closes when the certificate of occupancy is issued.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Change the steps' }).getAttribute('href')).toBe(
      '/staff/settings/workflow/BP',
    )
    expect(document.body.textContent).not.toMatch(/under_review|plan_review/)
  })
})
