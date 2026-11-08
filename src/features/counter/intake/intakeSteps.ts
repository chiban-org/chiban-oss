import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { CoreState } from '@/features/applications/states'
import type { IntakeStep } from '@/features/counter/intake/intakeHref'

export type TakeStep = IntakeStep | 'fee' | 'withdrawn'

export const DRAFT_STEPS = ['form', 'documents', 'submit'] as const satisfies readonly IntakeStep[]

export type DraftStep = (typeof DRAFT_STEPS)[number]

export function isDraftStep(step: string | undefined): step is DraftStep {
  return DRAFT_STEPS.some((s) => s === step)
}

type PayTiming = ApplicationTypeBody['payTiming']

export interface StepInput {
  state: CoreState
  payTiming: PayTiming
  dueCents: number
  requested: string | undefined
}

export function currentTakeStep(input: StepInput): TakeStep {
  if (input.state === 'withdrawn') return 'withdrawn'
  if (input.state === 'draft') {
    return isDraftStep(input.requested) ? input.requested : 'form'
  }
  const feeDue = input.payTiming === 'at_intake' && input.dueCents > 0
  return feeDue && input.requested !== 'done' ? 'fee' : 'done'
}

export interface StepLink {
  key: TakeStep
  label: string
}

export function takeStepLinks(payTiming: PayTiming): StepLink[] {
  return [
    { key: 'form', label: 'Application form' },
    { key: 'documents', label: 'Documents' },
    { key: 'submit', label: 'Attestation and submit' },
    ...(payTiming === 'at_intake' ? [{ key: 'fee' as const, label: 'Fee' }] : []),
    { key: 'done', label: 'Done' },
  ]
}
