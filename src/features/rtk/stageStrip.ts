import type { Stage } from '@/components/layout/StageStrip'
import type { RtkRequestView } from '@/features/rtk/requests'

export type RequestStageInput = Pick<
  RtkRequestView,
  'status' | 'statedDue' | 'firstResponseOn' | 'current'
>

function stage(key: string, label: string, status: Stage['status'], overdue = false): Stage {
  return { key, label, status, overdue }
}

function reached(input: RequestStageInput): Stage[] {
  return [
    stage('received', 'Received', 'done'),
    ...(input.statedDue === null ? [] : [stage('time_stated', 'Time stated', 'done')]),
  ]
}

function ended(input: RequestStageInput): Stage[] {
  if (input.status === 'withdrawn') {
    return [...reached(input), stage('withdrawn', 'Withdrawn', 'current')]
  }
  const responded = input.firstResponseOn === null ? [] : [stage('responded', 'Responded', 'done')]
  return [...reached(input), ...responded, stage('closed', 'Closed', 'done')]
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
      return [
        stage('received', 'Received', 'done'),
        stage('time_stated', 'Time stated', 'current', overdue),
        stage('responded', 'Responded', 'upcoming'),
        stage('closed', 'Closed', 'upcoming'),
      ]
    case 'responded':
      return [
        ...reached(input),
        stage('responded', 'Responded', 'current'),
        stage('closed', 'Closed', 'upcoming'),
      ]
    case 'closed':
    case 'withdrawn':
      return ended(input)
  }
}
