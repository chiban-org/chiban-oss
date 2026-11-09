import { nhDefaultLicenseType } from '@packs/nh/licenseTypes'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { LICENSE_FIELD } from '@/features/forms/formReferences'
import { recordLicenseCheck } from '@/features/licenseChecks/recordLicenseCheck'

export async function checkDemoLicense(
  db: Db,
  staff: Actor,
  input: { applicationId: string; checkedAt: Date },
  signal: AbortSignal,
): Promise<void> {
  const [row] = await db
    .select({ values: applications.values, typeKey: applications.applicationTypeKey })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
  const number = new Map(Object.entries((row?.values ?? {}) as Record<string, unknown>)).get(
    LICENSE_FIELD,
  )
  await recordLicenseCheck(
    db,
    staff,
    {
      applicationId: input.applicationId,
      licenseNumber: typeof number === 'string' ? number : 'Not given',
      licenseType: nhDefaultLicenseType(row?.typeKey ?? '') ?? 'Master electrician',
      result: 'active',
      note: null,
      checkedAt: input.checkedAt,
    },
    signal,
  )
}
