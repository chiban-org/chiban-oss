import type { DbOrTx } from '@/db/client'
import type { ReportRange } from '@/features/reports/range'
import { townToday } from '@/features/town/today'
import { addDays, parseCivilDate } from '@/types/civilDate'

export const REPORT_KEYS = ['permit-volume', 'processing-time', 'revenue'] as const
export type ReportKey = (typeof REPORT_KEYS)[number]

const DEFAULT_SPAN_DAYS = 364

export async function resolveRange(
  db: DbOrTx,
  params: URLSearchParams | Record<string, string | undefined>,
  signal: AbortSignal,
): Promise<ReportRange> {
  const get = (key: string): string =>
    (params instanceof URLSearchParams ? params.get(key) : params[key]) ?? ''
  const to = parseCivilDate(get('to'))
  const today = await townToday(db, new Date(), signal)
  const end = to.ok ? to.value : today
  const from = parseCivilDate(get('from'))
  return { from: from.ok ? from.value : addDays(end, -DEFAULT_SPAN_DAYS), to: end }
}
