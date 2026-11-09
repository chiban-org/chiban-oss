import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { env } from '@/config/env'
import { ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import { magicLinks, userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { safeNext } from '@/features/auth/safeNext'
import { createSession } from '@/features/auth/session'
import type { MailTransport } from '@/features/mail/transport'
import { createRateLimiter } from '@/server/rateLimiter'
import { err, ok, type Result } from '@/types/result'

export const MAGIC_LINK_TTL_MINUTES = 15
const LINK_TTL_MS = MAGIC_LINK_TTL_MINUTES * 60 * 1000
const MAX_REQUESTS = 5
const WINDOW_MS = 10 * 60 * 1000

const limiter = createRateLimiter({ max: MAX_REQUESTS, windowMs: WINDOW_MS })

export function resetMagicLinkLimiter(): void {
  limiter.reset()
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

type Eligibility = { eligible: true; userId: string | null } | { eligible: false }

async function eligibilityOf(db: DbOrTx, email: string): Promise<Eligibility> {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing === undefined) return { eligible: true, userId: null }
  return existing.kind === 'public' && existing.isActive
    ? { eligible: true, userId: existing.id }
    : { eligible: false }
}

async function findOrCreatePublicUser(db: DbOrTx, email: string): Promise<{ id: string } | null> {
  const [created] = await db
    .insert(users)
    .values({ email, displayName: email.split('@')[0] ?? email, kind: 'public' })
    .onConflictDoNothing()
    .returning({ id: users.id })
  if (created !== undefined) {
    await db.insert(userRoles).values({ userId: created.id, role: 'applicant' })
    return created
  }
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return existing?.kind === 'public' && existing.isActive ? { id: existing.id } : null
}

export async function requestMagicLink(
  db: DbOrTx,
  mail: MailTransport,
  rawEmail: string,
  signal: AbortSignal,
  next?: string,
): Promise<Result<void, 'rate_limited'>> {
  signal.throwIfAborted()
  const email = rawEmail.trim().toLowerCase()
  if (limiter.isLimited(email)) return err('rate_limited')
  limiter.recordFailure(email)

  const eligibility = await eligibilityOf(db, email)
  if (!eligibility.eligible) return ok(undefined)

  const token = randomBytes(32).toString('base64url')
  await db.insert(magicLinks).values({
    email,
    userId: eligibility.userId,
    nextPath: next !== undefined && safeNext(next) === next ? next : null,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  })
  const link = `${env.BASE_URL}/auth/verify?token=${token}`
  const sent = await mail.send(
    {
      to: email,
      subject: 'Your sign-in link',
      text: `Use this link to sign in. It works once and expires in 15 minutes.\n\n${link}\n`,
      html: `<p>Use this link to sign in. It works once and expires in 15 minutes.</p><p><a href="${link}">Sign in</a></p>`,
    },
    signal,
  )
  if (!sent.ok) console.error(`[auth] ${ErrorIds.MAIL_SEND_FAILED} sign-in link email was not sent`)
  return ok(undefined)
}

export async function consumeMagicLink(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
): Promise<Result<{ sid: string; userId: string; nextPath: string | null }, 'invalid'>> {
  signal.throwIfAborted()
  return await transactionResult(db, async (tx) => {
    const [claimed] = await tx
      .update(magicLinks)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(magicLinks.tokenHash, hashToken(token)),
          isNull(magicLinks.consumedAt),
          gt(magicLinks.expiresAt, sql`now()`),
        ),
      )
      .returning({ email: magicLinks.email, nextPath: magicLinks.nextPath })
    if (claimed === undefined) return err('invalid')
    const user = await findOrCreatePublicUser(tx, claimed.email)
    if (user === null) return err('invalid')
    const session = await createSession(tx, user.id, signal)
    if (!session.ok) return err('invalid')
    return ok({ sid: session.value.sid, userId: user.id, nextPath: claimed.nextPath })
  })
}

export async function peekMagicLink(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
): Promise<{ email: string } | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ email: magicLinks.email })
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.tokenHash, hashToken(token)),
        isNull(magicLinks.consumedAt),
        gt(magicLinks.expiresAt, sql`now()`),
      ),
    )
  if (row === undefined) return null
  const eligibility = await eligibilityOf(db, row.email)
  return eligibility.eligible ? { email: row.email } : null
}
