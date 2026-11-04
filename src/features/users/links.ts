import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { env } from '@/config/env'
import type { DbOrTx } from '@/db/client'
import { staffAccountLinks, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/createStaffUser'
import { hashPassword } from '@/features/auth/password'
import { createSession, revokeAllSessions } from '@/features/auth/session'
import { lockStaffAccounts } from '@/features/users/staffAccounts'
import { err, ok, type Result } from '@/types/result'

export type LinkPurpose = 'invite' | 'password_reset'

const DAY_MS = 24 * 60 * 60 * 1000

export const LINK_TTL_MS: Record<LinkPurpose, number> = {
  invite: 7 * DAY_MS,
  password_reset: DAY_MS,
}

export const SET_PASSWORD_PATH = '/staff/set-password'

type DeadState = 'invalid' | 'expired' | 'used' | 'revoked'

export type LinkPeek =
  | { state: 'valid'; purpose: LinkPurpose; email: string; displayName: string }
  | { state: DeadState; purpose: LinkPurpose | null }

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function linkUrl(token: string): string {
  return `${env.BASE_URL}${SET_PASSWORD_PATH}?token=${token}`
}

export async function revokeOpenLinks(
  tx: DbOrTx,
  userId: string,
  purpose: LinkPurpose | null,
): Promise<void> {
  await tx
    .update(staffAccountLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(staffAccountLinks.userId, userId),
        isNull(staffAccountLinks.consumedAt),
        isNull(staffAccountLinks.revokedAt),
        purpose === null ? undefined : eq(staffAccountLinks.purpose, purpose),
      ),
    )
}

export async function issueLink(
  tx: DbOrTx,
  input: { userId: string; purpose: LinkPurpose; createdBy: string },
  now: Date,
): Promise<string> {
  await revokeOpenLinks(tx, input.userId, input.purpose)
  const token = randomBytes(32).toString('base64url')
  await tx.insert(staffAccountLinks).values({
    ...input,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + LINK_TTL_MS[input.purpose]),
  })
  return token
}

async function findLink(db: DbOrTx, token: string, lock: boolean) {
  const query = db
    .select({ link: staffAccountLinks, user: users })
    .from(staffAccountLinks)
    .innerJoin(users, eq(users.id, staffAccountLinks.userId))
    .where(eq(staffAccountLinks.tokenHash, hashToken(token)))
  const [row] = lock ? await query.for('update', { of: staffAccountLinks }) : await query
  return row
}

type FoundLink = NonNullable<Awaited<ReturnType<typeof findLink>>>

function deadState(row: FoundLink | undefined, now: Date): DeadState | null {
  if (row === undefined) return 'invalid'
  if (row.link.consumedAt !== null) return 'used'
  if (row.link.revokedAt !== null || !row.user.isActive || row.user.kind !== 'staff') {
    return 'revoked'
  }
  return row.link.expiresAt <= now ? 'expired' : null
}

export async function peekStaffLink(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<LinkPeek> {
  signal.throwIfAborted()
  const row = await findLink(db, token, false)
  const dead = deadState(row, now)
  if (dead !== null || row === undefined) {
    return { state: dead ?? 'invalid', purpose: row?.link.purpose ?? null }
  }
  return {
    state: 'valid',
    purpose: row.link.purpose,
    email: row.user.email,
    displayName: row.user.displayName,
  }
}

export interface CompletedLink {
  purpose: LinkPurpose
  userId: string
  sid: string | null
}

export type CompleteError = 'weak_password' | DeadState

export interface CompleteInput {
  token: string
  password: string
  now?: Date
}

export async function completeStaffLink(
  db: DbOrTx,
  { token, password, now = new Date() }: CompleteInput,
  signal: AbortSignal,
): Promise<Result<CompletedLink, CompleteError>> {
  signal.throwIfAborted()
  const precheck = deadState(await findLink(db, token, false), now)
  if (precheck !== null) return err(precheck)
  if (password.length < MIN_PASSWORD_LENGTH) return err('weak_password')
  const passwordHash = await hashPassword(password, signal)
  return await transactionResult<CompletedLink, CompleteError>(db, async (tx) => {
    await lockStaffAccounts(tx)
    const row = await findLink(tx, token, true)
    const dead = deadState(row, now)
    if (dead !== null || row === undefined) return err(dead ?? 'invalid')
    const { link } = row
    await tx
      .update(staffAccountLinks)
      .set({ consumedAt: now })
      .where(eq(staffAccountLinks.id, link.id))
    await tx
      .update(staffAccountLinks)
      .set({ revokedAt: now })
      .where(
        and(
          eq(staffAccountLinks.userId, link.userId),
          ne(staffAccountLinks.id, link.id),
          isNull(staffAccountLinks.consumedAt),
          isNull(staffAccountLinks.revokedAt),
        ),
      )
    await tx.update(users).set({ passwordHash }).where(eq(users.id, link.userId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: link.userId },
        action: link.purpose === 'invite' ? 'user.invite.accept' : 'user.password.reset',
        entityType: 'user',
        entityId: link.userId,
      },
      signal,
    )
    if (link.purpose === 'password_reset') {
      await revokeAllSessions(tx, link.userId, signal)
      return ok({ purpose: link.purpose, userId: link.userId, sid: null })
    }
    const session = await createSession(tx, link.userId, signal)
    if (!session.ok) return err('invalid')
    return ok({ purpose: link.purpose, userId: link.userId, sid: session.value.sid })
  })
}
