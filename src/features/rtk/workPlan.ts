import type { WorkWarning } from '@/components/layout/WorkPlan'
import { daysLeftPhrase } from '@/lib/dayCount'
import { formatCivilDate } from '@/lib/formatDate'
import { isPending, requirementGroups } from './workPlanRequirements'
import type {
  PlanApproval,
  RequestDue,
  RequestNowStep,
  RequestPlanInput,
  RequestWorkPlan,
} from './workPlanTypes'

export type { PlanApproval, RequestPlanInput, RequestWorkPlan }

type Request = RequestPlanInput['request']

const FIRST_RESPONSE_DUE = 'First response due'
const STATED_DATE = 'Date the town stated:'

export function requestDue(request: Request): RequestDue | null {
  const current = request.current
  if (current === null) return null
  const label = request.status === 'awaiting_decision' ? STATED_DATE : FIRST_RESPONSE_DUE
  switch (current.kind) {
    case 'running':
      return { label, date: current.dueOn, daysLeft: current.daysRemaining }
    case 'due_today':
      return { label, date: current.dueOn, daysLeft: 0 }
    case 'overdue':
      return { label, date: current.dueOn, daysLeft: -current.daysOverdue }
    case 'responded_on_time':
    case 'responded_late':
      return null
  }
}

export function duePhrase(due: RequestDue): string {
  const left = due.daysLeft === 0 ? 'today' : daysLeftPhrase(due.daysLeft)
  return `${due.label} ${formatCivilDate(due.date)}, ${left}.`
}

function ask(request: Request, pending: number, due: RequestDue | null): string | null {
  switch (request.status) {
    case 'open':
      return due !== null && due.daysLeft < 0
        ? 'Send the first response now'
        : 'Send the first response'
    case 'awaiting_decision':
      return 'Release the records or deny the request'
    case 'responded':
      return pending > 0
        ? 'Release the approved records, then close the request'
        : 'Close the request'
    case 'closed':
    case 'withdrawn':
      return null
  }
}

function sentenceOf(request: Request, pending: number, due: RequestDue | null): string {
  if (request.status === 'closed') return 'This request is closed.'
  if (request.status === 'withdrawn') return 'The requester withdrew this request.'
  const waiting = `Waiting on: Town. ${ask(request, pending, due) ?? ''}.`
  return due === null ? waiting : `${waiting} ${duePhrase(due)}`
}

function warningsOf(request: Request, due: RequestDue | null): WorkWarning[] {
  if (due === null || due.daysLeft > 0) return []
  const first = request.status === 'open'
  if (due.daysLeft === 0) {
    const text = first ? 'The first response is due today.' : 'The date the town stated is today.'
    return [{ key: 'due', text }]
  }
  const date = formatCivilDate(due.date)
  const text = first
    ? `The first response is late. It was due ${date}.`
    : `The date the town stated has passed. It was ${date}.`
  return [{ key: 'due', text }]
}

function nowOf(request: Request, pending: number, due: RequestDue | null): RequestNowStep | null {
  const warnings = warningsOf(request, due)
  switch (request.status) {
    case 'open':
      return { kind: 'respond', task: 'Send the first response', note: null, warnings }
    case 'awaiting_decision':
      return {
        kind: 'release',
        task: 'Release the records',
        note: 'Find each record, approve the version to release, then release it. Deny the request instead once a withheld record is on file.',
        warnings,
      }
    case 'responded':
      return pending > 0
        ? { kind: 'release', task: 'Release the records', note: null, warnings }
        : {
            kind: 'close',
            task: 'Close the request',
            note: 'Nothing approved is waiting to be released.',
            warnings,
          }
    case 'closed':
    case 'withdrawn':
      return null
  }
}

export function planRequestWork(input: RequestPlanInput): RequestWorkPlan {
  const { request } = input
  const pending = input.approvals.filter(isPending).length
  const due = requestDue(request)
  return {
    sentence: sentenceOf(request, pending, due),
    now: nowOf(request, pending, due),
    due,
    groups: requirementGroups(input),
    pending,
  }
}
