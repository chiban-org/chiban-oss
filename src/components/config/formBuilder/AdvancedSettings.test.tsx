// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdvancedSettings } from '@/components/config/formBuilder/AdvancedSettings'
import type { FormField } from '@/features/forms/formSchema'

afterEach(cleanup)

const FIELD: FormField = { key: 'decision_date', label: 'Date', type: 'date', required: true }

function renderWith(onPatch: (patch: Partial<FormField>) => void) {
  render(
    <AdvancedSettings
      field={FIELD}
      frozen={false}
      references={[]}
      onKey={() => {}}
      onPatch={onPatch}
    />,
  )
}

describe('AdvancedSettings', () => {
  it('offers the appealed decision date fact', () => {
    const onPatch = vi.fn()
    renderWith(onPatch)
    fireEvent.change(screen.getByLabelText('Fact'), { target: { value: 'appealedDecisionDate' } })
    expect(onPatch).toHaveBeenCalledWith({ fact: 'appealedDecisionDate' })
    expect(screen.getByRole('option', { name: 'Date of the decision being appealed' })).toBeTruthy()
  })

  it('marks a question as a significance fact', () => {
    const onPatch = vi.fn()
    renderWith(onPatch)
    fireEvent.click(screen.getByLabelText('Shown beside the significance question'))
    expect(onPatch).toHaveBeenCalledWith({ significanceFact: true })
  })
})
