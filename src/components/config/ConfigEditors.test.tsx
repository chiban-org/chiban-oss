// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationTypeEditor } from '@/components/config/ApplicationTypeEditor'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { FeeLinesEditor } from '@/components/config/FeeLinesEditor'
import { ChecklistEditor, ConditionsEditor } from '@/components/config/SimpleEditors'
import { TownRuleEditor } from '@/components/config/TownRuleEditor'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import { skeletonBody } from '@/features/config/skeletons'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormBody } from '@/features/forms/formSchema'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'

afterEach(cleanup)

vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))

const PACK_RULES = [
  { key: 'nh.bp.decision', label: 'Building permit decision deadline' },
  { key: 'nh.appeal.suspension', label: 'Suspended by appeal (RSA 676:6)' },
]
const CLASSIFICATIONS = [
  {
    key: 'nh.building_permit',
    label: 'Building permit',
    mandatoryRuleKeys: ['nh.bp.decision'],
    board: null,
  },
  {
    key: 'nh.trade_permit',
    label: 'Trade permit',
    mandatoryRuleKeys: ['nh.appeal.suspension'],
    board: null,
  },
]

const TYPE = skeletonBody('application_type', 'BP') as ApplicationTypeBody
const _BUILDING_TYPE: ApplicationTypeBody = { ...TYPE, classification: 'nh.building_permit' }

describe('ApplicationTypeEditor', () => {
  it('publish error for a missing binding renders next to the bindings field', () => {
    render(
      <ApplicationTypeEditor
        body={{ ...TYPE, classification: 'nh.building_permit' }}
        onChange={vi.fn()}
        errors={{ bindings: 'Missing mandatory rules: nh.bp.decision.' }}
        packRules={PACK_RULES}
        classifications={CLASSIFICATIONS}
      />,
    )
    const group = screen.getByRole('group', { name: 'Bindings' })
    expect(within(group).getByRole('alert').textContent).toContain('nh.bp.decision')
    expect(group.getAttribute('aria-describedby')).toBe('error-bindings')
  })

  it('shows the mandatory rules of the chosen classification as locked on', () => {
    render(
      <ApplicationTypeEditor
        body={{ ...TYPE, classification: 'nh.building_permit', bindings: [] }}
        onChange={vi.fn()}
        errors={{}}
        packRules={PACK_RULES}
        classifications={CLASSIFICATIONS}
      />,
    )
    const decision = screen.getByRole<HTMLButtonElement>('checkbox', {
      name: /Building permit decision deadline/,
    })
    expect(decision.getAttribute('aria-checked')).toBe('true')
    expect(decision.disabled).toBe(true)
    const other = screen.getByRole('checkbox', { name: /Suspended by appeal/ })
    expect(other.getAttribute('aria-checked')).toBe('false')
    expect(document.body.textContent).not.toMatch(/\(nh\./)
  })

  it('toggling an optional binding reports the new list', () => {
    const onChange = vi.fn()
    render(
      <ApplicationTypeEditor
        body={{ ...TYPE, classification: 'nh.building_permit' }}
        onChange={onChange}
        errors={{}}
        packRules={PACK_RULES}
        classifications={CLASSIFICATIONS}
      />,
    )
    fireEvent.click(screen.getByLabelText(/Suspended by appeal/))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ bindings: ['nh.appeal.suspension'] }),
    )
  })

  it('shows the classification error next to the classification field', () => {
    render(
      <ApplicationTypeEditor
        body={TYPE}
        onChange={vi.fn()}
        errors={{ classification: 'Choose a classification before publishing.' }}
        packRules={PACK_RULES}
        classifications={CLASSIFICATIONS}
      />,
    )
    const group = screen.getByRole('group', { name: 'Classification' })
    expect(within(group).getByRole('alert').textContent).toContain('Choose a classification')
  })
})

describe('FeeLinesEditor', () => {
  const FEES = skeletonBody('fee_schedule', 'f') as FeeScheduleBody

  it('edits a flat amount and offers the after-the-fact multiplier', () => {
    const onChange = vi.fn()
    render(<FeeLinesEditor body={FEES} onChange={onChange} errors={{}} />)
    fireEvent.change(screen.getByLabelText('Amount in cents'), { target: { value: '4500' } })
    expect(onChange.mock.calls[0]?.[0].lines[0].expr).toEqual({ op: 'flat', cents: 4500 })
    fireEvent.click(screen.getByLabelText('Multiply when work started before the permit'))
    expect(onChange.mock.calls[1]?.[0].lines[0].expr.op).toBe('conditional_multiplier')
  })

  it('switching to a tiered table shows tier rows', () => {
    const onChange = vi.fn()
    render(<FeeLinesEditor body={FEES} onChange={onChange} errors={{}} />)
    fireEvent.change(screen.getByLabelText('Calculation'), { target: { value: 'tiered' } })
    expect(onChange.mock.calls[0]?.[0].lines[0].expr.op).toBe('tiered')
  })

  it('falls back to JSON for an expression with no table form', () => {
    const odd: FeeScheduleBody = {
      ...FEES,
      lines: [
        {
          code: 'x',
          label: 'X',
          due: 'at_intake',
          expr: {
            op: 'conditional_multiplier',
            when: { field: 'other', op: 'is_true' },
            factor: 3,
            of: { op: 'flat', cents: 1 },
          },
        },
      ],
    }
    render(<FeeLinesEditor body={odd} onChange={vi.fn()} errors={{}} />)
    expect(screen.getByLabelText(/as JSON/)).toBeTruthy()
  })

  it('shows the lines error next to the fee lines', () => {
    render(
      <FeeLinesEditor
        body={FEES}
        onChange={vi.fn()}
        errors={{ lines: 'Fee lines use fields the form does not have: ghost.' }}
      />,
    )
    expect(
      within(screen.getByRole('group', { name: 'Fee lines' })).getByRole('alert').textContent,
    ).toContain('ghost')
  })

  it('adds and removes a fee line', () => {
    const onChange = vi.fn()
    render(<FeeLinesEditor body={FEES} onChange={onChange} errors={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add fee line' }))
    expect(onChange.mock.calls[0]?.[0].lines).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remove line' }))
    expect(onChange.mock.calls[1]?.[0].lines).toHaveLength(0)
  })
})

describe('TownRuleEditor', () => {
  it('shows policy violations beside the value and the adoption record', () => {
    render(
      <TownRuleEditor
        body={{ ruleKey: 'town.bp.validity', value: 18 }}
        onChange={vi.fn()}
        errors={{
          value: 'The town cannot set this value.',
          adoption: 'Enter who adopted this value and the date they adopted it.',
        }}
        rule={{
          label: 'Building permit validity period',
          policy: 'The town chooses. Default 12.',
          unit: 'months',
          citation: { label: 'Town rule', url: null },
        }}
      />,
    )
    expect(
      within(screen.getByRole('group', { name: 'Value' })).getByRole('alert').textContent,
    ).toContain('cannot')
    expect(
      within(screen.getByRole('group', { name: 'Adoption record' })).getByRole('alert').textContent,
    ).toContain('adopted')
    expect(screen.getByText('The town chooses. Default 12.')).toBeTruthy()
  })
})
