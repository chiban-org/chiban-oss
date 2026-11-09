import { desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { licenseChecks } from '@/db/schema'

export type LicenseCheckRow = typeof licenseChecks.$inferSelect

export async function latestLicenseCheck(
  db: DbOrTx,
  applicationId: string,
): Promise<LicenseCheckRow | null> {
  const [row] = await db
    .select()
    .from(licenseChecks)
    .where(eq(licenseChecks.applicationId, applicationId))
    .orderBy(desc(licenseChecks.checkedAt), desc(licenseChecks.id))
    .limit(1)
  return row ?? null
}
