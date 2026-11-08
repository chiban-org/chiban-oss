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
