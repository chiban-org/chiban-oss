import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { contractorClaims, projectParties, projects, userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { isProjectParty } from '@/features/access/queries'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { claimMessage } from '@/features/contractors/claimMessage'
import type { MailTransport } from '@/features/mail/transport'
import { addParty } from '@/features/projects/parties'
import { err, ok, type Result } from '@/types/result'

const TOKEN_BYTES = 32
export const CLAIM_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MAX_PER_HOUR = 5

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function claimLink(token: string): string {
  return `${env.BASE_URL}/claim/${token}`
}

export function newClaimToken(now: Date): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return {
    token,
    tokenHash: hashClaimToken(token),
    expiresAt: new Date(now.getTime() + CLAIM_DAYS * DAY_MS),
  }
}

export type ClaimRole = 'contractor' | 'applicant'

export interface ClaimInput {
  projectId: string
  email: string
  name: string
  partyId?: string
  role?: ClaimRole
  applicationId?: string
}

type SenderKind = 'staff' | 'applicant'

export interface ClaimedProject {
  projectId: string
  role: ClaimRole
  applicationId: string | null
}

async function senderKind(db: Db, actor: Actor, projectId: string, signal: AbortSignal) {
  if (await hasCapability(db, actor.userId, 'project.manage_parties', signal)) return 'staff'
  if (await isProjectParty(db, actor, projectId, ['applicant', 'owner'], signal)) return 'applicant'
  return null
}

async function recentClaims(db: Db, projectId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contractorClaims)
    .where(
      and(
        eq(contractorClaims.projectId, projectId),
        ne(contractorClaims.sentByKind, 'system'),
        gt(contractorClaims.createdAt, new Date(now.getTime() - HOUR_MS)),
      ),
    )
  return row?.n ?? 0
}

interface ClaimParty {
  id: string
  linked: boolean
}

async function claimPartyFor(
  db: Db,
  actor: Actor,
  input: ClaimInput,
  signal: AbortSignal,
): Promise<ClaimParty | null> {
  const role = input.role ?? 'contractor'
  if (input.partyId !== undefined) {
    const [party] = await db
      .select({ id: projectParties.id, userId: projectParties.userId })
      .from(projectParties)
      .where(
        and(
          eq(projectParties.id, input.partyId),
          eq(projectParties.projectId, input.projectId),
          eq(projectParties.role, role),
          isNull(projectParties.removedAt),
        ),
      )
    return party === undefined ? null : { id: party.id, linked: party.userId !== null }
  }
  const added = await addParty(
    db,
    actor,
    { projectId: input.projectId, role, name: input.name, email: input.email },
    signal,
  )
  return added.ok ? { id: added.value.partyId, linked: added.value.linkedUserId !== null } : null
}

export async function sendContractorClaim(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: ClaimInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<{ claimId: string }, 'forbidden' | 'rate_limited' | 'send_failed' | 'already_linked'>
> {
  signal.throwIfAborted()
  const kind: SenderKind | null = await senderKind(db, actor, input.projectId, signal)
  if (kind === null) return err('forbidden')
  if ((await recentClaims(db, input.projectId, now)) >= MAX_PER_HOUR) return err('rate_limited')
  const party = await claimPartyFor(db, actor, input, signal)
  if (party === null) return err('forbidden')
  if (party.linked) return err('already_linked')
  const partyId = party.id
  const [project] = await db
    .select({ title: projects.title })
    .from(projects)
    .where(eq(projects.id, input.projectId))
  const { token, tokenHash, expiresAt } = newClaimToken(now)
  const email = input.email.trim().toLowerCase()
  const claimId = await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(contractorClaims)
      .values({
        projectId: input.projectId,
        partyId,
        applicationId: input.applicationId ?? null,
        email,
        tokenHash,
        sentBy: actor.userId,
        sentByKind: kind,
        expiresAt,
        createdAt: now,
      })
      .returning({ id: contractorClaims.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'contractor.claim.send',
        entityType: 'project',
        entityId: input.projectId,
        after: { claimId: row?.id, partyId },
      },
      signal,
    )
    return ok(row?.id ?? '')
  })
  if (!claimId.ok) return err('forbidden')
  const sent = await mail.send(
    claimMessage({
      to: email,
      name: input.name,
      role: input.role ?? 'contractor',
      title: project?.title ?? 'your project',
      link: claimLink(token),
      days: CLAIM_DAYS,
    }),
    signal,
  )
  if (!sent.ok) return err('send_failed')
  return ok({ claimId: claimId.value })
}

export async function claimProject(
  db: Db,
  actor: Actor | null,
  token: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<ClaimedProject, 'sign_in_required' | 'invalid' | 'email_mismatch'>> {
  signal.throwIfAborted()
  if (actor === null) return err('sign_in_required')
  const [claim] = await db
    .select()
    .from(contractorClaims)
    .where(eq(contractorClaims.tokenHash, hashClaimToken(token)))
  const usable =
    claim !== undefined &&
    claim.claimedAt === null &&
    claim.revokedAt === null &&
    claim.expiresAt.getTime() > now.getTime()
  if (!usable) return err('invalid')
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, actor.userId))
  if (actor.kind !== 'public' || user?.email.toLowerCase() !== claim.email.toLowerCase()) {
    return err('email_mismatch')
  }
  return await transactionResult<ClaimedProject, 'invalid'>(db, async (tx) => {
    const marked = await tx
      .update(contractorClaims)
      .set({ claimedAt: now, claimedBy: actor.userId })
      .where(and(eq(contractorClaims.id, claim.id), isNull(contractorClaims.claimedAt)))
      .returning({ id: contractorClaims.id })
    if (marked.length === 0) return err('invalid')
    const linked = await tx
      .update(projectParties)
      .set({ userId: actor.userId })
      .where(
        and(
          eq(projectParties.id, claim.partyId),
          or(isNull(projectParties.userId), eq(projectParties.userId, actor.userId)),
          isNull(projectParties.removedAt),
        ),
      )
      .returning({ id: projectParties.id, role: projectParties.role })
    const role = linked[0]?.role
    if (role !== 'contractor' && role !== 'applicant') return err('invalid')
    await tx.insert(userRoles).values({ userId: actor.userId, role }).onConflictDoNothing()
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'contractor.claim',
        entityType: 'project',
        entityId: claim.projectId,
        after: { claimId: claim.id, partyId: claim.partyId },
      },
      signal,
    )
    return ok({ projectId: claim.projectId, role, applicationId: claim.applicationId })
  })
}
