import type { AlertKind } from '@/features/health/evaluateAlerts'
import type { Result } from '@/types/result'

export type AlertChannelKind = 'email' | 'pager'

export interface AlertMessage {
  key: string
  kind: AlertKind | 'synthetic'
  severity: 'warning' | 'critical'
  state: 'firing' | 'resolved' | 'test'
  summary: string
  townName: string
  ackUrl: string | null
}

export interface AlertChannel {
  kind: AlertChannelKind
  send(msg: AlertMessage, signal: AbortSignal): Promise<Result<void, 'send_failed'>>
}
