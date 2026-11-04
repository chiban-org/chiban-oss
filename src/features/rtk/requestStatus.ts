import type { Status } from '@/features/design/tokens'
import type { RtkRequestView } from '@/features/rtk/requests'

type RequestState = Pick<
  RtkRequestView,
  'status' | 'firstResponseKind' | 'responseDue' | 'statedDue' | 'current'
>

export function isRequestOpen(request: Pick<RtkRequestView, 'status'>): boolean {
  return request.status !== 'closed' && request.status !== 'withdrawn'
}

export function requestRowChipStatus(status: RtkRequestView['status'], pastDue: boolean): Status {
  if (pastDue) return 'overdue'
  return status === 'responded' ? 'passed' : 'neutral'
}

export function requestChipStatus(request: RequestState): Status {
  return requestRowChipStatus(request.status, request.current?.kind === 'overdue')
}

export function requestNextStep(request: RequestState): string | null {
  if (!isRequestOpen(request)) return null
  if (request.firstResponseKind === null) {
    return request.current?.kind === 'overdue'
      ? 'The deadline has passed. Send the first response now.'
      : 'Send the first response before the deadline.'
  }
  if (request.status === 'awaiting_decision' && request.statedDue !== null) {
    return 'Release the records or deny the request by the date the town stated.'
  }
  return 'Release any approved records, then close the request.'
}
