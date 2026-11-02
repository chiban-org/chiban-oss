import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { townSettings } from '@/db/schema'
import { townToday } from '@/features/town/today'
import { addDays, type CivilDate, compareCivil } from '@/types/civilDate'

export type ServiceMode = 'active' | 'export_only' | 'closed'

export interface ServiceSettings {
  serviceStatus: 'active' | 'suspended' | 'terminated'
  serviceStatusSince: CivilDate | null
  exportWindowDays: number
}

export function serviceMode(settings: ServiceSettings, today: CivilDate): ServiceMode {
  if (settings.serviceStatus === 'active') return 'active'
  const since = settings.serviceStatusSince ?? today
  const lastExportDay = addDays(since, settings.exportWindowDays)
  return compareCivil(today, lastExportDay) <= 0 ? 'export_only' : 'closed'
}

export interface ServiceState {
  mode: ServiceMode
  exportUntil: CivilDate | null
}

export async function currentServiceState(
  db: DbOrTx,
  now: Date,
  signal: AbortSignal,
): Promise<ServiceState> {
  signal.throwIfAborted()
  const [row] = await db
    .select({
      serviceStatus: townSettings.serviceStatus,
      serviceStatusSince: townSettings.serviceStatusSince,
      exportWindowDays: townSettings.exportWindowDays,
    })
    .from(townSettings)
    .where(eq(townSettings.id, 1))
    .limit(1)
  if (row === undefined || row.serviceStatus === 'active')
    return { mode: 'active', exportUntil: null }
  const settings: ServiceSettings = {
    serviceStatus: row.serviceStatus,
    serviceStatusSince: row.serviceStatusSince as CivilDate | null,
    exportWindowDays: row.exportWindowDays,
  }
  const today = await townToday(db, now, signal)
  const since = settings.serviceStatusSince ?? today
  return {
    mode: serviceMode(settings, today),
    exportUntil: addDays(since, settings.exportWindowDays),
  }
}
