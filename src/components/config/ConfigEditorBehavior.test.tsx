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

describe('select options input', () => {
  it('keeps unfinished text so a second option can be typed', () => {
    const form: FormBody = {
      ...(skeletonBody('form', 'f') as FormBody),
      fields: [
        {
          key: 'a',
          label: 'A',
          type: 'select',
          required: false,
          options: [{ value: 'x', label: 'X' }],
        },
      ],
    }
    render(
      <Stateful
        initial={form}
        render={(b, set) => <FormFieldsEditor body={b} onChange={set} errors={{}} />}
      />,
    )
    const input = screen.getByLabelText<HTMLInputElement>('Options (value:label, comma separated)')
    fireEvent.change(input, { target: { value: 'x:X, ' } })
    expect(input.value).toBe('x:X, ')
    fireEvent.change(input, { target: { value: 'x:X, y:Y' } })
    expect(
      stateOf<{ fields: { options: { value: string }[] }[] }>().fields[0]?.options.map(
        (o) => o.value,
      ),
    ).toEqual(['x', 'y'])
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
    reviewers: [],
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
