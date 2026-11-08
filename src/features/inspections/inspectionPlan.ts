import type { Stage } from '@/components/layout/StageStrip'
import type { InspectionCancelReason, InspectionStatus } from '@/db/schema'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { type FocusRow, inspectionName, inspectorSentence, slotText } from './inspectorFocus'

export interface CancelFacts {
  reason: InspectionCancelReason | null
  byName: string | null
  on: CivilDate | null
}

export interface InspectionPlanInput {
  row: FocusRow
  viewerId: string
  today: CivilDate
  inspectorName: string | null
  recordedByName: string | null
  resultDate: CivilDate | null
  preferredDate: CivilDate | null
  permitClosed: boolean
  mayRecord: boolean
  maySchedule: boolean
  suspended: boolean
  cancel: CancelFacts | null
  followUp: { id: string; status: InspectionStatus } | null
  mayRequestReinspection: boolean
}

export type InspectionNowKind =
  | 'schedule'
  | 'wait_schedule'
  | 'record'
  | 'record_later'
  | 'waiting'
  | 'paused'
  | 'request_reinspection'
  | 'reinspection_on_file'
  | 'outcome'
  | 'cancelled'

export interface InspectionNow {
  kind: InspectionNowKind
  task: string
  note: string | null
}

export interface InspectionPlan {
  sentence: string
  owed: string | null
  stages: Stage[]
  now: InspectionNow
}

export const PAUSED_SENTENCE = 'Inspections are paused while this permit is under appeal.'

const FOLLOW_UP_WORD: Record<InspectionStatus, string> = {
  requested: 'requested',
  scheduled: 'scheduled',
  passed: 'passed',
  failed: 'failed',
  cancelled: 'cancelled',
}

function stage(key: string, label: string, status: Stage['status'], overdue = false): Stage {
  return { key, label, status, overdue }
}

function dateReached(input: InspectionPlanInput): boolean {
  const date = input.row.scheduledDate
  return date !== null && input.today >= date
}

function daysLate(input: InspectionPlanInput): number {
  const date = input.row.scheduledDate
  if (input.row.status !== 'scheduled' || date === null) return 0
  return Math.max(0, daysBetween(date as CivilDate, input.today))
}

function owedLine(input: InspectionPlanInput): string | null {
  const late = daysLate(input)
  const date = input.row.scheduledDate
  if (late === 0 || date === null) return null
  return `Result owed since ${formatCivilDate(date)} (${late} ${late === 1 ? 'day' : 'days'} late)`
}

function stagesOf(input: InspectionPlanInput): Stage[] {
  const { row } = input
  const first = row.reinspectionOf === null ? 'Requested' : 'Reinspection requested'
  const requested = (status: Stage['status']) => stage('requested', first, status)
  switch (row.status) {
    case 'requested':
      return [
        requested('current'),
        stage('scheduled', 'Scheduled', 'upcoming'),
        stage('result', 'Result', 'upcoming'),
      ]
    case 'scheduled':
      return dateReached(input)
        ? [
            requested('done'),
            stage('scheduled', 'Scheduled', 'done'),
            stage('result', 'Result', 'current', daysLate(input) > 0),
          ]
        : [
            requested('done'),
            stage('scheduled', 'Scheduled', 'current'),
            stage('result', 'Result', 'upcoming'),
          ]
    case 'passed':
    case 'failed':
      return [
        requested('done'),
        stage('scheduled', 'Scheduled', 'done'),
        stage('result', row.status === 'passed' ? 'Passed' : 'Failed', 'done'),
      ]
    case 'cancelled':
      return [
        requested('done'),
        ...(row.scheduledDate === null ? [] : [stage('scheduled', 'Scheduled', 'done')]),
        stage('cancelled', 'Cancelled', 'current'),
      ]
  }
}

function preferenceNote(input: InspectionPlanInput): string {
  return input.preferredDate === null
    ? 'The requester has no preferred day.'
    : `The requester prefers ${formatCivilDate(input.preferredDate)}.`
}

function recordedNote(input: InspectionPlanInput): string | null {
  if (input.resultDate === null) return null
  const by = input.recordedByName === null ? '' : ` by ${input.recordedByName}`
  return `Recorded${by} on ${formatCivilDate(input.resultDate)}.`
}

function scheduledNow(input: InspectionPlanInput): InspectionNow {
  const when = slotText(input.row, input.today)
  if (input.suspended) {
    return {
      kind: 'paused',
      task: 'Wait for the appeal to be decided',
      note: 'The checklist opens again once the permit is no longer under appeal.',
    }
  }
  if (input.mayRecord && dateReached(input)) {
    return { kind: 'record', task: 'Record the result', note: when }
  }
  if (input.mayRecord) {
    return {
      kind: 'record_later',
      task: 'Record the result on the day',
      note: 'This inspection can be recorded on or after its scheduled date.',
    }
  }
  return {
    kind: 'waiting',
    task: `Waiting on ${input.inspectorName ?? 'the inspector'}`,
    note: when,
  }
}

function failedNow(input: InspectionPlanInput): InspectionNow {
  const note = recordedNote(input)
  if (input.followUp !== null) {
    const word = FOLLOW_UP_WORD[input.followUp.status]
    return { kind: 'reinspection_on_file', task: `Reinspection ${word}`, note }
  }
  if (input.maySchedule && input.mayRequestReinspection) {
    return { kind: 'request_reinspection', task: 'Request the reinspection', note }
  }
  return { kind: 'outcome', task: 'Failed', note }
}

function passedNow(input: InspectionPlanInput): InspectionNow {
  const note = recordedNote(input)
  if (!input.permitClosed) return { kind: 'outcome', task: 'Passed', note }
  return {
    kind: 'outcome',
    task: 'The permit is closed.',
    note: note === null ? 'Passed.' : `Passed. ${note}`,
  }
}

function nowOf(input: InspectionPlanInput): InspectionNow {
  switch (input.row.status) {
    case 'requested':
      return input.maySchedule
        ? {
            kind: 'schedule',
            task: `Schedule the ${inspectionName(input.row)}`,
            note: preferenceNote(input),
          }
        : {
            kind: 'wait_schedule',
            task: 'Waiting on the town to schedule it',
            note: preferenceNote(input),
          }
    case 'scheduled':
      return scheduledNow(input)
    case 'passed':
      return passedNow(input)
    case 'failed':
      return failedNow(input)
    case 'cancelled':
      return { kind: 'cancelled', task: 'Cancelled', note: null }
  }
}

function outcomeOn(word: string, date: CivilDate | null): string {
  return date === null ? `${word}.` : `${word} on ${formatCivilDate(date)}.`
}

function failedSentence(input: InspectionPlanInput): string {
  const outcome = outcomeOn('Failed', input.resultDate)
  if (input.followUp !== null) {
    return `${outcome} The reinspection is ${FOLLOW_UP_WORD[input.followUp.status]}.`
  }
  return input.mayRequestReinspection ? `${outcome} No reinspection is requested yet.` : outcome
}

function sentenceOf(input: InspectionPlanInput): string {
  switch (input.row.status) {
    case 'requested':
      return inspectorSentence({
        rows: [input.row],
        today: input.today,
        viewerId: input.viewerId,
        inspectorName: input.inspectorName,
      })
    case 'scheduled':
      return input.suspended
        ? PAUSED_SENTENCE
        : inspectorSentence({
            rows: [input.row],
            today: input.today,
            viewerId: input.viewerId,
            inspectorName: input.inspectorName,
          })
    case 'passed': {
      const outcome = outcomeOn('Passed', input.resultDate)
      return input.permitClosed ? `${outcome} The permit is closed.` : outcome
    }
    case 'failed':
      return failedSentence(input)
    case 'cancelled':
      return outcomeOn('Cancelled', input.cancel?.on ?? null)
  }
}

export function planInspection(input: InspectionPlanInput): InspectionPlan {
  return {
    sentence: sentenceOf(input),
    owed: owedLine(input),
    stages: stagesOf(input),
    now: nowOf(input),
  }
}
