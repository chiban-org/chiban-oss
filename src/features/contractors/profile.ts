import type { LicenseTrade } from '@packs/nh/licenseTypes'
import { eq } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { accountProfiles, contractorProfiles, userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { linkAccountParties, lockContractorEmail } from '@/features/contractors/accountLink'
import { err, ok, type Result } from '@/types/result'

export interface PersonDetails {
  name: string
  phone: string | null
  mailingAddress: string | null
}

export interface ContractorDetails extends PersonDetails {
  companyName: string
  trades: LicenseTrade[]
  licenses: { trade: LicenseTrade; number: string }[]
}

async function publicEmail(tx: Tx, actor: Actor): Promise<string | null> {
  if (actor.kind !== 'public') return null
  const [user] = await tx
    .select({ email: users.email, kind: users.kind, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, actor.userId))
  return user?.kind === 'public' && user.isActive ? user.email : null
}

async function writePerson(tx: Tx, userId: string, input: PersonDetails): Promise<void> {
  const now = new Date()
  await tx.update(users).set({ displayName: input.name }).where(eq(users.id, userId))
  const details = { phone: input.phone, mailingAddress: input.mailingAddress, updatedAt: now }
  await tx
    .insert(accountProfiles)
    .values({ userId, ...details })
    .onConflictDoUpdate({ target: accountProfiles.userId, set: details })
}

export async function savePersonDetails(
  db: DbOrTx,
  actor: Actor,
  input: PersonDetails,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden'>> {
  signal.throwIfAborted()
  return await transactionResult(db, async (tx) => {
    if ((await publicEmail(tx, actor)) === null) return err('forbidden')
    await writePerson(tx, actor.userId, input)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'account.profile.update',
        entityType: 'user',
        entityId: actor.userId,
        after: input,
      },
      signal,
    )
    return ok(undefined)
  })
}

async function upsertContractor(tx: Tx, userId: string, input: ContractorDetails) {
  const values = {
    companyName: input.companyName,
    trades: input.trades,
    licenses: input.licenses.filter((l) => input.trades.includes(l.trade)),
  }
  const inserted = await tx
    .insert(contractorProfiles)
    .values({ userId, ...values })
    .onConflictDoNothing()
    .returning({ userId: contractorProfiles.userId })
  if (inserted.length === 0) {
    await tx
      .update(contractorProfiles)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(contractorProfiles.userId, userId))
  }
  return { created: inserted.length > 0, values }
}

export async function saveContractorProfile(
  db: DbOrTx,
  actor: Actor,
  input: ContractorDetails,
  signal: AbortSignal,
): Promise<Result<{ created: boolean; linkedParties: number }, 'forbidden'>> {
  signal.throwIfAborted()
  return await transactionResult(db, async (tx) => {
    const email = await publicEmail(tx, actor)
    if (email === null) return err('forbidden')
    await lockContractorEmail(tx, email)
    await writePerson(tx, actor.userId, input)
    const { created, values } = await upsertContractor(tx, actor.userId, input)
    await tx
      .insert(userRoles)
      .values({ userId: actor.userId, role: 'contractor' })
      .onConflictDoNothing()
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: created ? 'contractor.profile.create' : 'contractor.profile.update',
        entityType: 'user',
        entityId: actor.userId,
        after: { ...values, phone: input.phone, mailingAddress: input.mailingAddress },
      },
      signal,
    )
    const linkedParties = await linkAccountParties(tx, actor.userId, signal)
    return ok({ created, linkedParties })
  })
}
