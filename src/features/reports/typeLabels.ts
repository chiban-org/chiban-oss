import type { DbOrTx } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'

export async function applicationTypeLabels(
  db: DbOrTx,
  keys: string[],
  signal: AbortSignal,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  for (const key of new Set(keys)) {
    const published = await getPublished(db, 'application_type', key, signal)
    const body = published?.body as ApplicationTypeBody | undefined
    labels.set(key, body?.label ?? key)
  }
  return labels
}
