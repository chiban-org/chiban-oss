import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { DbOrTx } from '@/db/client'
import { magicLinks, userRoles, users } from '@/db/schema'
import { createSession } from '@/features/auth/session'
import type { MailTransport } from '@/features/mail/transport'
import { createRateLimiter } from '@/server/rateLimiter'
import { err, ok, type Result } from '@/types/result'

const LINK_TTL_MS = 15 * 60 * 1000
const MAX_REQUESTS = 5
const WINDOW_MS = 10 * 60 * 1000

const limiter = createRateLimiter({ max: MAX_REQUESTS, windowMs: WINDOW_MS })

export function resetMagicLinkLimiter(): void {
  limiter.reset()
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

async function findOrCreatePublicUser(db: DbOrTx, email: string): Promise<{ id: string } | null> {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing !== undefined) {
    return existing.kind === 'public' && existing.isActive ? { id: existing.id } : null
  }
  const [created] = await db
    .insert(users)
    .values({ email, displayName: email.split('@')[0] ?? email, kind: 'public' })
    .onConflictDoNothing()
    .returning({ id: users.id })
  if (created === undefined) return null
  await db.insert(userRoles).values({ userId: created.id, role: 'applicant' })
  return created
}

export async function requestMagicLink(
  db: DbOrTx,
  mail: MailTransport,
  rawEmail: string,
  signal: AbortSignal,
): Promise<Result<void, 'rate_limited'>> {
  signal.throwIfAborted()
  const email = rawEmail.trim().toLowerCase()
  if (limiter.isLimited(email)) return err('rate_limited')
  limiter.recordFailure(email)

  const user = await findOrCreatePublicUser(db, email)
  if (user === null) return ok(undefined)

  const token = randomBytes(32).toString('base64url')
  await db.insert(magicLinks).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  })
  const link = `${env.BASE_URL}/auth/verify?token=${token}`
  await mail.send(
    {
      to: email,
      subject: 'Your sign-in link',
      text: `Use this link to sign in. It works once and expires in 15 minutes.\n\n${link}\n`,
      html: `<p>Use this link to sign in. It works once and expires in 15 minutes.</p><p><a href="${link}">Sign in</a></p>`,
    },
    signal,
  )
  return ok(undefined)
}

export async function consumeMagicLink(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
): Promise<Result<{ sid: string; userId: string }, 'invalid'>> {
  signal.throwIfAborted()
  const [claimed] = await db
    .update(magicLinks)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(magicLinks.tokenHash, hashToken(token)),
        isNull(magicLinks.consumedAt),
        gt(magicLinks.expiresAt, sql`now()`),
        sql`exists (select 1 from ${users} where ${users.id} = ${magicLinks.userId} and ${users.isActive} and ${users.kind} = 'public')`,
      ),
    )
    .returning({ userId: magicLinks.userId })
  if (claimed === undefined) return err('invalid')
  const session = await createSession(db, claimed.userId, signal)
  if (!session.ok) return err('invalid')
  return ok({ sid: session.value.sid, userId: claimed.userId })
}

export async function peekMagicLink(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
): Promise<{ email: string } | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ email: users.email })
    .from(magicLinks)
    .innerJoin(users, eq(users.id, magicLinks.userId))
    .where(
      and(
        eq(magicLinks.tokenHash, hashToken(token)),
        isNull(magicLinks.consumedAt),
        gt(magicLinks.expiresAt, sql`now()`),
        eq(users.isActive, true),
        eq(users.kind, 'public'),
      ),
    )
  return row === undefined ? null : { email: row.email }
}
