// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import type { GateResult } from '@/features/gates/evaluateGates'
import { expectRefusalBeside } from '@/test/besideField'

const refusal = vi.hoisted(() => ({ field: '', message: '' }))
const answer = vi.hoisted(
  () => () =>
    Promise.resolve({
      ok: false as const,
      error: refusal.message,
      fieldErrors: { [refusal.field]: refusal.message },
    }),
)

vi.mock('./actions', () => ({ markCompleteAction: answer }))
vi.mock('./gateActions', () => ({
  overrideGateAction: answer,
  statutoryExceptionAction: answer,
  revokeOverrideAction: answer,
}))
vi.mock('./conditionActions', () => ({
  applyConditionAction: answer,
  setConditionStatusAction: answer,
}))
vi.mock('./clockFeeActions', () => ({ adjustClockAction: answer, feeOverrideAction: answer }))
vi.mock('./buildingActions', () => ({ renewAction: answer }))

const { GateControls } = await import('./gateControls')
const { ConditionsPanel, CompletenessPanel } = await import('./panels')
const { FeeOverrideForm } = await import('./feePanels')

afterEach(cleanup)

function inProvider(node: ReactNode) {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
}

function typeInto(name: RegExp, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
}

function refuseWith(field: string, message: string) {
  refusal.field = field
  refusal.message = message
}

const VIEW = {
  id: 'a1',
  state: 'under_review',
  today: '2026-11-06',
  classification: 'nh.building_permit',
  completedDate: null,
  permissions: {
    canOverrideGate: true,
    canRecordStatutoryException: true,
    canIssue: true,
    canOverrideFee: true,
  },
  conditions: [],
  conditionLibrary: [{ code: 'SEPTIC', text: 'Approved septic design on file' }],
  fees: {
    preview: { lines: [{ code: 'el', label: 'Electrical' }] },
    assessments: [],
    overrides: [],
  },
} as unknown as StaffApplicationView

function gate(kind: 'administrative' | 'statutory'): GateResult {
  return { key: 'g1', label: 'A gate', kind, effective: 'blocked', override: null } as GateResult
}

describe('workflow forms show a refusal beside its field', () => {
  it('the gate override reason', async () => {
    refuseWith('reason', 'Enter a reason of at least 10 characters.')
    inProvider(<GateControls view={VIEW} result={gate('administrative')} />)
    typeInto(/Reason/, 'short')
    fireEvent.click(screen.getByRole('button', { name: 'Override with reason' }))
    await expectRefusalBeside(
      screen.getByRole('textbox', { name: /Reason/ }),
      'Enter a reason of at least 10 characters.',
    )
  })

  it('the statutory exception citation', async () => {
    refuseWith('citation', 'Enter the legal citation.')
    inProvider(<GateControls view={VIEW} result={gate('statutory')} />)
    typeInto(/citation/, 'x')
    typeInto(/explanation/, 'y')
    fireEvent.click(screen.getByRole('button', { name: 'Record exception' }))
    await expectRefusalBeside(
      screen.getByRole('textbox', { name: /citation/ }),
      'Enter the legal citation.',
    )
  })

  it('the fee override amount', async () => {
    refuseWith('amount', 'Enter the amount in dollars and cents, like 25.00.')
    inProvider(<FeeOverrideForm view={VIEW} dueCents={1000} />)
    typeInto(/Amount/, 'abc')
    typeInto(/Reason/, 'Hardship')
    fireEvent.click(screen.getByRole('button', { name: 'Save fee override' }))
    await expectRefusalBeside(
      screen.getByRole('textbox', { name: /Amount/ }),
      'Enter the amount in dollars and cents, like 25.00.',
    )
  })

  it('the condition to apply', async () => {
    refuseWith('code', 'That condition is already on this application.')
    inProvider(<ConditionsPanel view={VIEW} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply condition' }))
    await expectRefusalBeside(
      screen.getByRole('combobox', { name: 'Condition' }),
      'That condition is already on this application.',
    )
  })

  it('the completed date', async () => {
    refuseWith('completedDate', 'Enter the completed date as a date.')
    inProvider(<CompletenessPanel view={{ ...VIEW, state: 'submitted' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }))
    await expectRefusalBeside(
      screen.getByLabelText(/Completed on/),
      'Enter the completed date as a date.',
    )
  })
})
