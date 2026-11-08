import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { accountProfiles, type ContractorLicense, contractorProfiles, users } from '@/db/schema'

export interface AccountView {
  email: string
  name: string
  phone: string | null
  mailingAddress: string | null
  contractor: { companyName: string; trades: string[]; licenses: ContractorLicense[] } | null
}

export async function loadAccountView(
  db: DbOrTx,
  userId: string,
  signal: AbortSignal,
): Promise<AccountView | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({
      email: users.email,
      name: users.displayName,
      phone: accountProfiles.phone,
      mailingAddress: accountProfiles.mailingAddress,
      companyName: contractorProfiles.companyName,
      trades: contractorProfiles.trades,
      licenses: contractorProfiles.licenses,
    })
    .from(users)
    .leftJoin(accountProfiles, eq(accountProfiles.userId, users.id))
    .leftJoin(contractorProfiles, eq(contractorProfiles.userId, users.id))
    .where(eq(users.id, userId))
  if (row === undefined) return null
  return {
    email: row.email,
    name: row.name,
    phone: row.phone,
    mailingAddress: row.mailingAddress,
    contractor:
      row.companyName === null
        ? null
        : { companyName: row.companyName, trades: row.trades ?? [], licenses: row.licenses ?? [] },
  }
}
