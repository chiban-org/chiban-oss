import type { Stage } from '@/components/layout/StageStrip'
import { ACKNOWLEDGED_LABEL, isAcknowledgedOnly } from '@/features/rtk/requestStatus'
import type { RtkRequestView } from '@/features/rtk/requests'

export type RequestStageInput = Pick<
  RtkRequestView,
  'status' | 'statedDue' | 'firstResponseOn' | 'current'
> &
  Partial<Pick<RtkRequestView, 'firstResponseKind' | 'acknowledgedOn' | 'followUpOn'>>

function stage(key: string, label: string, status: Stage['status'], overdue = false): Stage {
  return { key, label, status, overdue }
}

function acknowledged(input: RequestStageInput): boolean {
  return input.acknowledgedOn !== undefined && input.acknowledgedOn !== null
}

function reached(input: RequestStageInput): Stage[] {
  return [
    stage('received', 'Received', 'done'),
    ...(acknowledged(input) ? [stage('acknowledged', ACKNOWLEDGED_LABEL, 'done')] : []),
    ...(input.statedDue === null ? [] : [stage('time_stated', 'Time stated', 'done')]),
  ]
}

function respondedBeforeEnd(input: RequestStageInput): boolean {
  if (input.firstResponseOn === null) return false
  if (!acknowledged(input)) return true
  return input.firstResponseKind !== 'acknowledged'
}

function ended(input: RequestStageInput): Stage[] {
  const responded = respondedBeforeEnd(input) ? [stage('responded', 'Responded', 'done')] : []
  const last =
    input.status === 'withdrawn'
      ? stage('withdrawn', 'Withdrawn', 'current')
      : stage('closed', 'Closed', 'done')
  return [...reached(input), ...responded, last]
}

function awaitingDecision(input: RequestStageInput, overdue: boolean): Stage[] {
  return [
    stage('received', 'Received', 'done'),
    ...(acknowledged(input) ? [stage('acknowledged', ACKNOWLEDGED_LABEL, 'done')] : []),
    stage('time_stated', 'Time stated', 'current', overdue),
    stage('responded', 'Responded', 'upcoming'),
    stage('closed', 'Closed', 'upcoming'),
  ]
}

function responded(input: RequestStageInput): Stage[] {
  if (
    isAcknowledgedOnly({ status: input.status, firstResponseKind: input.firstResponseKind ?? null })
  ) {
    return [
      stage('received', 'Received', 'done'),
      ...(input.statedDue === null ? [] : [stage('time_stated', 'Time stated', 'done')]),
      stage('acknowledged', ACKNOWLEDGED_LABEL, 'current'),
      stage('responded', 'Responded', 'upcoming'),
      stage('closed', 'Closed', 'upcoming'),
    ]
  }
  return [
    ...reached(input),
    stage('responded', 'Responded', 'current'),
    stage('closed', 'Closed', 'upcoming'),
  ]
}

export function requestStages(input: RequestStageInput): Stage[] {
  const overdue = input.current?.kind === 'overdue'
  switch (input.status) {
    case 'open':
      return [
        stage('received', 'Received', 'current', overdue),
        stage('responded', 'Responded', 'upcoming'),
        stage('closed', 'Closed', 'upcoming'),
      ]
    case 'awaiting_decision':
      return awaitingDecision(input, overdue)
    case 'responded':
      return responded(input)
    case 'closed':
    case 'withdrawn':
      return ended(input)
  }
}
