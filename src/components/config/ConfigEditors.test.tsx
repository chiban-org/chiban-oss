// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationTypeEditor } from '@/components/config/ApplicationTypeEditor'
import { ChecklistEditor } from '@/components/config/ChecklistEditor'
import { ConditionsEditor } from '@/components/config/ConditionsEditor'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { FeeLinesEditor } from '@/components/config/FeeLinesEditor'
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
    boardKind: null,
  },
  {
    key: 'nh.trade_permit',
    label: 'Trade permit',
    mandatoryRuleKeys: ['nh.appeal.suspension'],
    boardKind: null,
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
        errors={{
          bindings:
            'Turn on the rules this kind of proceeding requires: Building permit decision deadline.',
        }}
        packRules={PACK_RULES}
        classifications={CLASSIFICATIONS}
      />,
    )
    const group = screen.getByRole('group', { name: 'State law rules' })
    expect(within(group).getByRole('alert').textContent).toContain('Building permit decision')
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
        errors={{ classification: 'Choose the kind of proceeding before publishing.' }}
        packRules={PACK_RULES}
        classifications={CLASSIFICATIONS}
      />,
    )
    const group = screen.getByRole('group', { name: 'Kind of proceeding' })
    expect(within(group).getByRole('alert').textContent).toContain('kind of proceeding')
  })
})

describe('FeeLinesEditor', () => {
  const FEES = skeletonBody('fee_schedule', 'f') as FeeScheduleBody

  it('edits a flat amount in dollars and offers the after-the-fact multiplier', () => {
    const onChange = vi.fn()
    render(<FeeLinesEditor body={FEES} onChange={onChange} errors={{}} />)
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '45' } })
    expect(onChange.mock.calls[0]?.[0].lines[0].expr).toEqual({ op: 'flat', cents: 4500 })
    fireEvent.click(
      screen.getByLabelText('Charge more when work started before the permit was issued'),
    )
    expect(onChange.mock.calls[1]?.[0].lines[0].expr.op).toBe('conditional_multiplier')
  })

  it('switching to a tiered table shows tier rows', () => {
    const onChange = vi.fn()
    render(<FeeLinesEditor body={FEES} onChange={onChange} errors={{}} />)
    fireEvent.change(screen.getByLabelText('How it is worked out'), { target: { value: 'tiered' } })
    expect(onChange.mock.calls[0]?.[0].lines[0].expr.op).toBe('tiered')
  })

  it('falls back to editing as data for an expression with no table form', () => {
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
    expect(screen.getByLabelText('The whole fee written as data')).toBeTruthy()
    expect(screen.getByText(/formula the fields here cannot show/)).toBeTruthy()
  })

  it('shows the lines error next to the fee lines', () => {
    render(
      <FeeLinesEditor
        body={FEES}
        onChange={vi.fn()}
        errors={{ lines: 'The fee schedule counts answers this form does not ask: Ghost.' }}
      />,
    )
    expect(
      within(screen.getByRole('group', { name: 'Fees' })).getByRole('alert').textContent,
    ).toContain('Ghost')
  })

  it('adds and removes a fee line', () => {
    const onChange = vi.fn()
    render(<FeeLinesEditor body={FEES} onChange={onChange} errors={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a fee' }))
    expect(onChange.mock.calls[0]?.[0].lines).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remove this fee' }))
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
      within(screen.getByRole('group', { name: "The town's value" })).getByRole('alert')
        .textContent,
    ).toContain('cannot')
    expect(
      within(screen.getByRole('group', { name: 'Adoption record' })).getByRole('alert').textContent,
    ).toContain('adopted')
    expect(screen.getByText('The town chooses. Default 12.')).toBeTruthy()
  })
})
