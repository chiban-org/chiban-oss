import { nhDefaultLicenseType } from '@packs/nh/licenseTypes'
import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { contractorProfiles, users } from '@/db/schema'
import { tradeForLicenseType, tradeLabel } from '@/features/contractors/trades'

export interface ContractorAccountSummary {
  companyName: string
  contactName: string
  licenses: { trade: string; label: string; number: string }[]
  prefillLicenseNumber: string | null
}

export async function findContractorAccount(
  db: DbOrTx,
  input: { email: string; applicationTypeKey: string },
  signal: AbortSignal,
): Promise<ContractorAccountSummary | null> {
  signal.throwIfAborted()
  const email = input.email.trim()
  if (email === '') return null
  const [row] = await db
    .select({
      companyName: contractorProfiles.companyName,
      contactName: users.displayName,
      licenses: contractorProfiles.licenses,
    })
    .from(users)
    .innerJoin(contractorProfiles, eq(contractorProfiles.userId, users.id))
    .where(and(eq(users.email, email), eq(users.kind, 'public'), eq(users.isActive, true)))
  if (row === undefined) return null
  const trade = tradeForLicenseType(nhDefaultLicenseType(input.applicationTypeKey))
  return {
    companyName: row.companyName,
    contactName: row.contactName,
    licenses: row.licenses.map((l) => ({ ...l, label: tradeLabel(l.trade) })),
    prefillLicenseNumber: row.licenses.find((l) => l.trade === trade)?.number ?? null,
  }
}
