// @vitest-environment jsdom
import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdvancedSettings } from '@/components/config/formBuilder/AdvancedSettings'
import { PackTextProvider } from '@/components/PackTextProvider'
import type { FormField } from '@/features/forms/formSchema'
import { packText } from '@/features/packs/packText'
import { withPackForTest } from '@/features/packs/registry'
import type { StatePack } from '@/features/packs/schema'

afterEach(cleanup)

const FIELD: FormField = { key: 'decision_date', label: 'Date', type: 'date', required: true }
const SIGNIFICANCE = 'Shown beside the significance question'

function renderWith(
  onPatch: (patch: Partial<FormField>) => void,
  pack: StatePack = ME_PACK,
  field: FormField = FIELD,
) {
  render(
    <PackTextProvider value={withPackForTest(pack, () => packText())}>
      <AdvancedSettings
        field={field}
        frozen={false}
        references={[]}
        onKey={vi.fn()}
        onPatch={onPatch}
      />
    </PackTextProvider>,
  )
}

describe('the Fact hint', () => {
  it('says the appealed decision date is read from the answers, not copied into project facts', () => {
    renderWith(vi.fn(), ME_PACK, { ...FIELD, fact: 'appealedDecisionDate' })
    expect(
      screen.getByText(
        'The late appeal warning reads this answer as the date of the decision being appealed. It is not copied into the project facts.',
      ),
    ).toBeTruthy()
    expect(
      screen.queryByText('Copies the answer into the project facts that rules read.'),
    ).toBeNull()
  })

  it('keeps the project facts hint for the other facts', () => {
    renderWith(vi.fn(), ME_PACK, { ...FIELD, fact: 'dwellingUnits' })
    expect(
      screen.getByText('Copies the answer into the project facts that rules read.'),
    ).toBeTruthy()
  })
})

describe('AdvancedSettings', () => {
  it('offers the appealed decision date fact', () => {
    const onPatch = vi.fn()
    renderWith(onPatch)
    fireEvent.change(screen.getByLabelText('Fact'), { target: { value: 'appealedDecisionDate' } })
    expect(onPatch).toHaveBeenCalledWith({ fact: 'appealedDecisionDate' })
    expect(screen.getByRole('option', { name: 'Date of the decision being appealed' })).toBeTruthy()
  })

  it('marks a question as a significance fact under a pack with the question', () => {
    const onPatch = vi.fn()
    renderWith(onPatch, ME_PACK)
    fireEvent.click(screen.getByLabelText(SIGNIFICANCE))
    expect(onPatch).toHaveBeenCalledWith({ significanceFact: true })
  })

  it('hides the significance checkbox under a pack without the question', () => {
    renderWith(vi.fn(), NH_PACK)
    expect(screen.queryByLabelText(SIGNIFICANCE)).toBeNull()
    expect(screen.getByLabelText('Staff only')).toBeTruthy()
  })
})
