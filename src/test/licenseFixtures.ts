import { NH_LICENSE_LOOKUP } from '@packs/nh/links'
import type { DbOrTx } from '@/db/client'
import { licenseChecks } from '@/db/schema'

export async function recordActiveLicense(
  db: DbOrTx,
  applicationId: string,
  checkedBy: string,
): Promise<void> {
  await db.insert(licenseChecks).values({
    applicationId,
    licenseNumber: 'EL-1',
    licenseType: 'Master electrician',
    result: 'active',
    lookupUrl: NH_LICENSE_LOOKUP.url,
    checkedBy,
  })
}
