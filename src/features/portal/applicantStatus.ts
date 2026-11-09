import type { ItemStatus } from '@/features/applications/documentChecklist'
import type { DocumentStage } from '@/features/applications/documentItemSchema'
import type { CoreState } from '@/features/applications/states'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import type { CivilDate } from '@/types/civilDate'

export type ApplicantAction = 'submit' | 'pay' | 'inspect' | 'documents'

export interface ApplicantNow {
  task: string
  note: string | null
  action: ApplicantAction
}

export interface ApplicantStatus {
  sentence: string
  now: ApplicantNow | null
}

export interface ApplicantStatusInput {
  state: CoreState
  board: boolean
  dueCents: number
  missingDocuments: readonly string[]
  decisionDue: CivilDate | null
  decisionLate: boolean
  canRequestInspection: boolean
}

export const DECISION_LATE_TEXT =
  'That date has passed. Call the land use office to ask when to expect the decision.'

const OUTCOMES: Partial<Record<CoreState, string>> = {
  denied: 'Denied.',
  withdrawn: 'Withdrawn.',
  expired: 'Expired.',
  closed: 'Closed. The permit is complete.',
  suspended: 'Suspended while an appeal is decided.',
}

function waitingSentence(input: ApplicantStatusInput): string {
  if (input.board) {
    return input.state === 'submitted'
      ? 'Filed. Waiting on the town to accept it for the board.'
      : 'Waiting on the board. Hearing and decision dates appear below once they are set.'
  }
  return 'Waiting on the town to review it.'
}

function withDecisionDate(sentence: string, input: ApplicantStatusInput): string {
  if (input.decisionDue === null) return sentence
  const due = `${sentence} The town's decision is due ${formatCivilDate(input.decisionDue)}.`
  return input.decisionLate ? `${due} ${DECISION_LATE_TEXT}` : due
}

function paySentence(input: ApplicantStatusInput, amount: string): string {
  const outcome = OUTCOMES[input.state]
  if (outcome !== undefined) {
    return `${outcome} ${amount} in fees charged before the decision is still owed.`
  }
  if (input.state === 'decided' && !input.board) {
    return `Approved. Pay ${amount} to have the permit issued.`
  }
  if (input.state === 'decided') return `Approved by the board. A fee of ${amount} is due.`
  if (input.state === 'issued') return `Issued. A balance of ${amount} is still due.`
  return withDecisionDate(`Submitted. A fee of ${amount} is due.`, input)
}

function plainSentence(input: ApplicantStatusInput): string {
  const outcome = OUTCOMES[input.state]
  if (outcome !== undefined) return outcome
  if (input.state === 'draft') return 'Not sent to the town yet.'
  if (input.state === 'decided') {
    return input.board ? 'Approved by the board.' : 'Approved. The town will issue the permit.'
  }
  if (input.state === 'issued') {
    if (input.canRequestInspection) {
      return 'Issued. Request an inspection when the work is ready for one.'
    }
    return input.board ? 'Approved.' : 'Issued. Nothing is waiting on you.'
  }
  return withDecisionDate(waitingSentence(input), input)
}

function documentsStep(input: ApplicantStatusInput): ApplicantNow | null {
  if (input.missingDocuments.length === 0) return null
  const list = input.missingDocuments.join(', ')
  const lead = input.state === 'draft' ? 'Still needed before you submit' : 'Still needed'
  return { task: 'Add the missing documents', note: `${lead}: ${list}.`, action: 'documents' }
}

function nowStep(input: ApplicantStatusInput): ApplicantNow | null {
  if (input.dueCents > 0) {
    return { task: `Pay ${formatCents(input.dueCents)}`, note: null, action: 'pay' }
  }
  const documents = documentsStep(input)
  if (documents !== null) return documents
  if (input.state === 'draft') {
    return { task: 'Check your answers and submit', note: null, action: 'submit' }
  }
  if (input.state === 'issued' && input.canRequestInspection) {
    return { task: 'Request an inspection', note: null, action: 'inspect' }
  }
  return null
}

export function applicantStatus(input: ApplicantStatusInput): ApplicantStatus {
  const sentence =
    input.dueCents > 0 ? paySentence(input, formatCents(input.dueCents)) : plainSentence(input)
  return { sentence, now: nowStep(input) }
}

const ASKED_STAGES: Partial<Record<CoreState, readonly DocumentStage[]>> = {
  draft: ['to_file'],
  submitted: ['to_file', 'before_decision'],
  under_review: ['to_file', 'before_decision'],
  decided: ['before_issue'],
  issued: ['before_co'],
}

export function missingNow(
  rows: readonly { label: string; stage: DocumentStage; status: ItemStatus; open: boolean }[],
  state: CoreState,
): string[] {
  const asked = ASKED_STAGES[state] ?? []
  return rows
    .filter((r) => r.open && r.status === 'missing' && asked.includes(r.stage))
    .map((r) => r.label)
}
