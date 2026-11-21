import type { Status } from '@/features/design/tokens'
import { RTK_STATUS_LABELS } from '@/features/rtk/labels'
import type { RtkRequestView } from '@/features/rtk/requests'

type RequestState = Pick<
  RtkRequestView,
  'status' | 'firstResponseKind' | 'responseDue' | 'statedDue' | 'current'
>

export const ACKNOWLEDGED_LABEL = 'Acknowledged'

export function isRequestOpen(request: Pick<RtkRequestView, 'status'>): boolean {
  return request.status !== 'closed' && request.status !== 'withdrawn'
}

export function isAcknowledgedOnly(request: {
  status: string
  firstResponseKind: string | null
}): boolean {
  return request.status === 'responded' && request.firstResponseKind === 'acknowledged'
}

export function requestRowChipStatus(
  status: RtkRequestView['status'],
  pastDue: boolean,
  firstResponseKind: string | null = null,
): Status {
  if (pastDue) return 'overdue'
  if (isAcknowledgedOnly({ status, firstResponseKind })) return 'neutral'
  return status === 'responded' ? 'passed' : 'neutral'
}

export function requestChipStatus(request: RequestState): Status {
  return requestRowChipStatus(
    request.status,
    request.current?.kind === 'overdue',
    request.firstResponseKind,
  )
}

export function requestStatusLabel(
  request: Pick<RtkRequestView, 'status' | 'firstResponseKind'>,
): string {
  return isAcknowledgedOnly(request) ? ACKNOWLEDGED_LABEL : RTK_STATUS_LABELS[request.status]
}
