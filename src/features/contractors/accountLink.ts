import { and, eq, isNull, type SQL, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { contractorProfiles, projectParties, userRoles, users } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'

export const PARTY_LINK_ACTION = 'contractor.party.link'

export async function lockContractorEmail(tx: Tx, email: string): Promise<void> {
  const key = `contractor-link:${email.trim().toLowerCase()}`
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
}

async function contractorAccountFor(tx: Tx, where: SQL) {
  const [row] = await tx
    .select({ userId: users.id, email: users.email })
    .from(users)
    .innerJoin(contractorProfiles, eq(contractorProfiles.userId, users.id))
    .where(and(where, eq(users.kind, 'public'), eq(users.isActive, true)))
  return row ?? null
}

interface LinkContext {
  accountUserId: string
  email: string
  actorUserId: string
  signal: AbortSignal
}

async function linkWhere(tx: Tx, where: SQL | undefined, context: LinkContext): Promise<number> {
  const linked = await tx
    .update(projectParties)
    .set({ userId: context.accountUserId })
    .where(
      and(
        where,
        eq(projectParties.role, 'contractor'),
        eq(projectParties.email, context.email),
        isNull(projectParties.userId),
        isNull(projectParties.removedAt),
      ),
    )
    .returning({ id: projectParties.id, projectId: projectParties.projectId })
  if (linked.length === 0) return 0
  await tx
    .insert(userRoles)
    .values({ userId: context.accountUserId, role: 'contractor' })
    .onConflictDoNothing()
  for (const party of linked) {
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: context.actorUserId },
        action: PARTY_LINK_ACTION,
        entityType: 'project',
        entityId: party.projectId,
        after: { partyId: party.id, userId: context.accountUserId, match: 'verified_email' },
      },
      context.signal,
    )
  }
  return linked.length
}

export async function linkAccountParties(
  tx: Tx,
  userId: string,
  signal: AbortSignal,
): Promise<number> {
  const account = await contractorAccountFor(tx, eq(users.id, userId))
  if (account === null) return 0
  await lockContractorEmail(tx, account.email)
  return await linkWhere(tx, undefined, {
    accountUserId: account.userId,
    email: account.email,
    actorUserId: userId,
    signal,
  })
}

export async function linkNewContractorParty(
  tx: Tx,
  party: { partyId: string; email: string },
  context: { actorUserId: string; signal: AbortSignal },
): Promise<string | null> {
  await lockContractorEmail(tx, party.email)
  const account = await contractorAccountFor(tx, eq(users.email, party.email.trim()))
  if (account === null) return null
  const linked = await linkWhere(tx, eq(projectParties.id, party.partyId), {
    accountUserId: account.userId,
    email: account.email,
    ...context,
  })
  return linked === 0 ? null : account.userId
}
