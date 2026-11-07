// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationTypeEditor } from '@/components/config/ApplicationTypeEditor'
import { ChecklistEditor } from '@/components/config/ChecklistEditor'
import { ConditionsEditor } from '@/components/config/ConditionsEditor'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { FeeLinesEditor } from '@/components/config/FeeLinesEditor'
import { FormBuilder } from '@/components/config/formBuilder/FormBuilder'
import { TownRuleEditor } from '@/components/config/TownRuleEditor'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import { skeletonBody } from '@/features/config/skeletons'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import { NO_FORM_BUILDER_DATA } from '@/features/forms/formReferences'
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
        render={(b, set) => (
          <FormBuilder body={b} onChange={set} errors={{}} data={NO_FORM_BUILDER_DATA} />
        )}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit Description of work' }))
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
    const key = screen.getByLabelText('Item key')
    fireEvent.change(key, { target: { value: 'footing-1' } })
    expect(screen.getByLabelText('Item key')).toBe(key)
    cleanup()
    render(
      <Stateful
        initial={skeletonBody('fee_schedule', 'f') as FeeScheduleBody}
        render={(b, set) => <FeeLinesEditor body={b} onChange={set} errors={{}} />}
      />,
    )
    const feeCode = screen.getByLabelText('Fee code')
    fireEvent.change(feeCode, { target: { value: 'building' } })
    expect(screen.getByLabelText('Fee code')).toBe(feeCode)
    expect(stateOf<{ lines: { code: string }[] }>().lines[0]?.code).toBe('building')
  })
})

describe('membership conditions', () => {
  it('the in operator edits its answers as a list of rows and stores them as an array', () => {
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
        render={(b, set) => (
          <FormBuilder body={b} onChange={set} errors={{}} data={NO_FORM_BUILDER_DATA} />
        )}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit B' }))
    const show = screen.getByRole('group', { name: 'Show only when' })
    expect(within(show).getByLabelText<HTMLInputElement>('Answer 2').value).toBe('y')
    fireEvent.click(within(show).getByRole('button', { name: 'Add an answer' }))
    const third = within(show).getByLabelText<HTMLInputElement>('Answer 3')
    expect(
      stateOf<{ fields: { showIf: { value: string[] } }[] }>().fields[1]?.showIf.value,
    ).toEqual(['x', 'y'])
    fireEvent.change(third, { target: { value: 'z' } })
    expect(
      stateOf<{ fields: { showIf: { value: string[] } }[] }>().fields[1]?.showIf.value,
    ).toEqual(['x', 'y', 'z'])
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
    fireEvent.change(screen.getByLabelText('Kind of proceeding'), {
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
    boards: [],
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
    expect(screen.getByLabelText<HTMLInputElement>('Form title').value).toBe('First')
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
    expect(screen.getByLabelText<HTMLInputElement>('Form title').value).toBe('Restored')
    const hidden = document.querySelector('input[name="body"]') as HTMLInputElement
    expect(JSON.parse(hidden.value).label).toBe('Restored')
  })

  it('lets a form publish even though the builder shows required applicant fields', () => {
    const { container } = render(
      <ConfigEditorForm
        kind="form"
        configKey="f"
        initialBody={skeletonBody('form', 'f')}
        resetKey="v1"
        context={context}
        saveAction={noop}
        publishAction={noop}
      />,
    )
    const form = container.querySelector('form') as HTMLFormElement
    expect(form.querySelector('[required]')).not.toBeNull()
    expect(form.noValidate).toBe(true)
  })
})
