import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { townSettings } from '@/db/schema'

export async function intakeOpen(
  db: DbOrTx,
  _imageRef: string | null,
  _appVersion: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ enabled: townSettings.anonymousIntakeEnabled })
    .from(townSettings)
    .where(eq(townSettings.id, 1))
  return row?.enabled === true
}
