import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { contractorClaims, projectParties, projects, userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { isProjectParty } from '@/features/access/queries'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { MailTransport } from '@/features/mail/transport'
import { addParty } from '@/features/projects/parties'
import { err, ok, type Result } from '@/types/result'

const TOKEN_BYTES = 32
const CLAIM_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MAX_PER_HOUR = 5

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export interface ClaimInput {
  projectId: string
  email: string
  name: string
  partyId?: string
}

type SenderKind = 'staff' | 'applicant'

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
        gt(contractorClaims.createdAt, new Date(now.getTime() - HOUR_MS)),
      ),
    )
  return row?.n ?? 0
}

async function contractorPartyFor(db: Db, actor: Actor, input: ClaimInput, signal: AbortSignal) {
  if (input.partyId !== undefined) {
    const [party] = await db
      .select({ id: projectParties.id })
      .from(projectParties)
      .where(
        and(
          eq(projectParties.id, input.partyId),
          eq(projectParties.projectId, input.projectId),
          eq(projectParties.role, 'contractor'),
          isNull(projectParties.removedAt),
        ),
      )
    return party?.id ?? null
  }
  const added = await addParty(
    db,
    actor,
    { projectId: input.projectId, role: 'contractor', name: input.name, email: input.email },
    signal,
  )
  return added.ok ? added.value.partyId : null
}

export async function sendContractorClaim(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: ClaimInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ claimId: string }, 'forbidden' | 'rate_limited' | 'send_failed'>> {
  signal.throwIfAborted()
  const kind: SenderKind | null = await senderKind(db, actor, input.projectId, signal)
  if (kind === null) return err('forbidden')
  if ((await recentClaims(db, input.projectId, now)) >= MAX_PER_HOUR) return err('rate_limited')
  const partyId = await contractorPartyFor(db, actor, input, signal)
  if (partyId === null) return err('forbidden')
  const [project] = await db
    .select({ title: projects.title })
    .from(projects)
    .where(eq(projects.id, input.projectId))
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const email = input.email.trim().toLowerCase()
  const claimId = await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(contractorClaims)
      .values({
        projectId: input.projectId,
        partyId,
        email,
        tokenHash: hashClaimToken(token),
        sentBy: actor.userId,
        sentByKind: kind,
        expiresAt: new Date(now.getTime() + CLAIM_DAYS * DAY_MS),
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
  const link = `${env.BASE_URL}/claim/${token}`
  const title = project?.title ?? 'your project'
  const sent = await mail.send(
    {
      to: email,
      subject: `Claim your project in Chiban: ${title}`,
      text: `${actorLine(input.name)}\n\nUse this link to claim the project and follow its permits. It works once and expires in ${CLAIM_DAYS} days.\n\n${link}\n`,
      html: `<p>${actorLine(input.name)}</p><p>Use this link to claim the project and follow its permits. It works once and expires in ${CLAIM_DAYS} days.</p><p><a href="${link}">Claim the project</a></p>`,
    },
    signal,
  )
  if (!sent.ok) return err('send_failed')
  return ok({ claimId: claimId.value })
}

function actorLine(name: string): string {
  return `${name}, you were named as a contractor on a project at the Town of Alder Pond.`
}

export async function claimProject(
  db: Db,
  actor: Actor | null,
  token: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ projectId: string }, 'sign_in_required' | 'invalid' | 'email_mismatch'>> {
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
  return await transactionResult<{ projectId: string }, 'invalid'>(db, async (tx) => {
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
          isNull(projectParties.userId),
          isNull(projectParties.removedAt),
        ),
      )
      .returning({ id: projectParties.id })
    if (linked.length === 0) return err('invalid')
    await tx
      .insert(userRoles)
      .values({ userId: actor.userId, role: 'contractor' })
      .onConflictDoNothing()
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
    return ok({ projectId: claim.projectId })
  })
}
