// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationTypeEditor } from '@/components/config/ApplicationTypeEditor'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { FeeLinesEditor } from '@/components/config/FeeLinesEditor'
import { FormFieldsEditor } from '@/components/config/FormFieldsEditor'
import {
  ChecklistEditor,
  ConditionsEditor,
  TemplateEditor,
} from '@/components/config/SimpleEditors'
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
  { key: 'nh.building_permit', label: 'Building permit', mandatoryRuleKeys: ['nh.bp.decision'] },
  { key: 'nh.trade_permit', label: 'Trade permit', mandatoryRuleKeys: ['nh.appeal.suspension'] },
]

const TYPE = skeletonBody('application_type', 'BP') as ApplicationTypeBody
const BUILDING_TYPE: ApplicationTypeBody = { ...TYPE, classification: 'nh.building_permit' }

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
    const decision = screen.getByLabelText<HTMLInputElement>(/Building permit decision deadline/)
    expect(decision.checked).toBe(true)
    expect(decision.disabled).toBe(true)
    const other = screen.getByLabelText<HTMLInputElement>(/Suspended by appeal/)
    expect(other.checked).toBe(false)
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

describe('FormFieldsEditor', () => {
  const FORM = skeletonBody('form', 'f') as FormBody

  it('adds and removes fields', () => {
    const onChange = vi.fn()
    render(<FormFieldsEditor body={FORM} onChange={onChange} errors={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }))
    expect(onChange.mock.calls[0]?.[0].fields).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remove field' }))
    expect(onChange.mock.calls[1]?.[0].fields).toHaveLength(0)
  })

  it('changing a type, the required flag, and a validation maximum reports the new field', () => {
    const onChange = vi.fn()
    render(<FormFieldsEditor body={FORM} onChange={onChange} errors={{}} />)
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'integer' } })
    expect(onChange.mock.calls[0]?.[0].fields[0].type).toBe('integer')
    fireEvent.click(screen.getByLabelText('Staff only'))
    expect(onChange.mock.calls[1]?.[0].fields[0].staffOnly).toBe(true)
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '10000' } })
    expect(onChange.mock.calls[2]?.[0].fields[0].validation.max).toBe(10000)
  })

  it('offers show-if only against earlier fields', () => {
    const two: FormBody = {
      ...FORM,
      fields: [...FORM.fields, { key: 'b', label: 'B', type: 'text', required: false }],
    }
    render(<FormFieldsEditor body={two} onChange={vi.fn()} errors={{}} />)
    const pickers = screen.getAllByLabelText<HTMLSelectElement>('Show if: field')
    expect([...(pickers[0]?.options ?? [])].map((o) => o.value)).toEqual([''])
    expect([...(pickers[1]?.options ?? [])].map((o) => o.value)).toEqual(['', 'description'])
  })

  it('shows the fields error next to the fields group', () => {
    render(
      <FormFieldsEditor body={FORM} onChange={vi.fn()} errors={{ fields: 'options required' }} />,
    )
    expect(
      within(screen.getByRole('group', { name: 'Fields' })).getByRole('alert').textContent,
    ).toBe('options required')
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

describe('TemplateEditor', () => {
  it('inserts a merge field from the picker and shows the body error beside the text', () => {
    const onChange = vi.fn()
    render(
      <TemplateEditor
        body={{ key: 't', label: 'T', kind: 'permit', body: 'Permit' }}
        onChange={onChange}
        errors={{ body: 'Unknown merge fields: nope.' }}
        mergeFields={['town.name', 'application.number']}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'town.name' }))
    expect(onChange.mock.calls[0]?.[0].body).toBe('Permit{{town.name}}')
    expect(
      within(screen.getByRole('group', { name: 'Template text' })).getByRole('alert').textContent,
    ).toContain('nope')
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

function Stateful<T>({
  initial,
  render,
}: {
  initial: T
  render: (body: T, set: (next: T) => void) => React.ReactNode
}) {
  const [body, setBody] = useState(initial)
  return (
    <>
      {render(body, setBody)}
      <output data-testid="state">{JSON.stringify(body)}</output>
    </>
  )
}

function stateOf<T>(): T {
  return JSON.parse(screen.getByTestId('state').textContent) as T
}

describe('editors keep rows mounted while a key is typed', () => {
  it('form field key', () => {
    render(
      <Stateful
        initial={skeletonBody('form', 'f') as FormBody}
        render={(b, set) => <FormFieldsEditor body={b} onChange={set} errors={{}} />}
      />,
    )
    const before = screen.getByLabelText('Key')
    fireEvent.change(before, { target: { value: 'renamed' } })
    expect(screen.getByLabelText('Key')).toBe(before)
    expect(stateOf<{ fields: { key: string }[] }>().fields[0]?.key).toBe('renamed')
  })

  it('condition code, checklist item key, and fee line code', () => {
    render(
      <Stateful
        initial={skeletonBody('condition_library', 'c') as ConditionLibraryBody}
        render={(b, set) => <ConditionsEditor body={b} onChange={set} errors={{}} />}
      />,
    )
    const code = screen.getByLabelText('Code')
    fireEvent.change(code, { target: { value: 'SEPTIC' } })
    expect(screen.getByLabelText('Code')).toBe(code)
    cleanup()
    render(
      <Stateful
        initial={skeletonBody('inspection_checklist', 'k') as ChecklistBody}
        render={(b, set) => <ChecklistEditor body={b} onChange={set} errors={{}} />}
      />,
    )
    const key = screen.getByLabelText('Key')
    fireEvent.change(key, { target: { value: 'footing-1' } })
    expect(screen.getByLabelText('Key')).toBe(key)
    cleanup()
    render(
      <Stateful
        initial={skeletonBody('fee_schedule', 'f') as FeeScheduleBody}
        render={(b, set) => <FeeLinesEditor body={b} onChange={set} errors={{}} />}
      />,
    )
    const feeCode = screen.getByLabelText('Code')
    fireEvent.change(feeCode, { target: { value: 'building' } })
    expect(screen.getByLabelText('Code')).toBe(feeCode)
    expect(stateOf<{ lines: { code: string }[] }>().lines[0]?.code).toBe('building')
  })
})

describe('membership conditions', () => {
  it('the in operator stores the comma separated values as an array and shows an existing array', () => {
    const form: FormBody = {
      ...(skeletonBody('form', 'f') as FormBody),
      fields: [
        { key: 'a', label: 'A', type: 'text', required: false },
        {
          key: 'b',
          label: 'B',
          type: 'text',
          required: false,
          showIf: { field: 'a', op: 'in', value: ['x', 'y'] },
        },
      ],
    }
    render(
      <Stateful
        initial={form}
        render={(b, set) => <FormFieldsEditor body={b} onChange={set} errors={{}} />}
      />,
    )
    const [, value = document.body] = screen.getAllByLabelText<HTMLInputElement>('Show if: value')
    expect((value as HTMLInputElement).value).toBe('x, y')
    fireEvent.change(value, { target: { value: 'x, y, z' } })
    expect(
      stateOf<{ fields: { showIf: { value: string[] } }[] }>().fields[1]?.showIf.value,
    ).toEqual(['x', 'y', 'z'])
  })
})

describe('delimited list inputs', () => {
  it('keep unfinished text so a second entry can be typed', () => {
    render(
      <Stateful
        initial={BUILDING_TYPE}
        render={(b, set) => (
          <ApplicationTypeEditor
            body={b}
            onChange={set}
            errors={{}}
            packRules={PACK_RULES}
            classifications={CLASSIFICATIONS}
          />
        )}
      />,
    )
    const input = screen.getByLabelText<HTMLInputElement>('Checklist keys (comma separated)')
    fireEvent.change(input, { target: { value: 'footing' } })
    fireEvent.change(input, { target: { value: 'footing, ' } })
    expect(input.value).toBe('footing, ')
    fireEvent.change(input, { target: { value: 'footing, framing' } })
    expect(stateOf<{ checklistKeys: string[] }>().checklistKeys).toEqual(['footing', 'framing'])
    expect(input.value).toBe('footing, framing')
  })
})

describe('classification choice', () => {
  it('selecting a classification adds its mandatory rules to the bindings', () => {
    render(
      <Stateful
        initial={TYPE}
        render={(b, set) => (
          <ApplicationTypeEditor
            body={b}
            onChange={set}
            errors={{}}
            packRules={PACK_RULES}
            classifications={CLASSIFICATIONS}
          />
        )}
      />,
    )
    fireEvent.change(screen.getByLabelText('Proceeding classification'), {
      target: { value: 'nh.building_permit' },
    })
    expect(stateOf<{ bindings: string[] }>().bindings).toEqual(['nh.bp.decision'])
  })
})

describe('ConfigEditorForm', () => {
  const noop = () => Promise.resolve({ ok: true as const, message: '' })
  const context = {
    packRules: PACK_RULES,
    classifications: CLASSIFICATIONS,
    mergeFields: [],
    townRules: {},
  }

  it('shows the restored body when the configuration version changes', () => {
    const first = { ...(skeletonBody('form', 'f') as FormBody), label: 'First' }
    const restored = { ...first, label: 'Restored' }
    const { rerender } = render(
      <ConfigEditorForm
        kind="form"
        configKey="f"
        initialBody={first}
        resetKey="v1"
        context={context}
        saveAction={noop}
        publishAction={noop}
      />,
    )
    expect(screen.getByLabelText<HTMLInputElement>('Form label').value).toBe('First')
    rerender(
      <ConfigEditorForm
        kind="form"
        configKey="f"
        initialBody={restored}
        resetKey="v2"
        context={context}
        saveAction={noop}
        publishAction={noop}
      />,
    )
    expect(screen.getByLabelText<HTMLInputElement>('Form label').value).toBe('Restored')
    const hidden = document.querySelector('input[name="body"]') as HTMLInputElement
    expect(JSON.parse(hidden.value).label).toBe('Restored')
  })
})
