import { and, desc, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { anonymousIntakeVerifications, townSettings } from '@/db/schema'

export async function verifiedFor(
  db: DbOrTx,
  imageRef: string | null,
  appVersion: string,
): Promise<boolean> {
  const [latest] = await db
    .select({ passed: anonymousIntakeVerifications.passed })
    .from(anonymousIntakeVerifications)
    .where(
      imageRef === null
        ? and(
            isNull(anonymousIntakeVerifications.imageRef),
            eq(anonymousIntakeVerifications.appVersion, appVersion),
          )
        : eq(anonymousIntakeVerifications.imageRef, imageRef),
    )
    .orderBy(desc(anonymousIntakeVerifications.ranAt))
    .limit(1)
  return latest?.passed === true
}

export async function intakeOpen(
  db: DbOrTx,
  imageRef: string | null,
  appVersion: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ enabled: townSettings.anonymousIntakeEnabled })
    .from(townSettings)
    .where(eq(townSettings.id, 1))
  return row?.enabled === true && (await verifiedFor(db, imageRef, appVersion))
}
