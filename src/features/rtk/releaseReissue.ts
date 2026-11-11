import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '@/db/client'
import { rtkReleaseLinks, rtkReleases, rtkRequests } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { MailTransport } from '@/features/mail/transport'
import { mintReleaseLink, sendReleaseLink } from '@/features/rtk/releaseMail'
import { err, ok, type Result } from '@/types/result'

const ReissueSchema = z.object({
  releaseId: z.string().uuid(),
  recipientEmail: z.string().trim().toLowerCase().email().max(320),
})

export type ReissueError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'no_link'
  | 'link_revoked'
  | 'link_active'
  | 'send_failed'

export interface ReissueContext {
  db: Db
  mail: MailTransport
  signal: AbortSignal
  now?: Date
}

export async function currentLinkExpiry(
  db: DbOrTx,
  release: { id: string; linkExpiresAt: Date | null },
): Promise<Date | null> {
  const [latest] = await db
    .select({ expiresAt: rtkReleaseLinks.expiresAt })
    .from(rtkReleaseLinks)
    .where(eq(rtkReleaseLinks.releaseId, release.id))
    .orderBy(desc(rtkReleaseLinks.expiresAt))
    .limit(1)
  return latest?.expiresAt ?? release.linkExpiresAt
}

export async function reissueReleaseLink(
  context: ReissueContext,
  actor: Actor,
  input: z.input<typeof ReissueSchema>,
): Promise<Result<{ expiresAt: Date }, ReissueError>> {
  const { db, mail, signal, now = new Date() } = context
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ReissueSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult<{ expiresAt: Date }, ReissueError>(db, async (tx) => {
    const [release] = await tx
      .select({
        id: rtkReleases.id,
        requestId: rtkReleases.requestId,
        releasedOn: rtkReleases.releasedOn,
        linkExpiresAt: rtkReleases.linkExpiresAt,
        linkRevokedAt: rtkReleases.linkRevokedAt,
        number: rtkRequests.number,
      })
      .from(rtkReleases)
      .innerJoin(rtkRequests, eq(rtkRequests.id, rtkReleases.requestId))
      .where(eq(rtkReleases.id, value.releaseId))
      .for('update', { of: rtkReleases })
    if (release === undefined) return err('not_found')
    if (release.linkExpiresAt === null) return err('no_link')
    if (release.linkRevokedAt !== null) return err('link_revoked')
    const expiry = await currentLinkExpiry(tx, release)
    if (expiry !== null && expiry.getTime() > now.getTime()) return err('link_active')
    const link = mintReleaseLink(now)
    await tx.insert(rtkReleaseLinks).values({
      releaseId: release.id,
      tokenHash: link.hash,
      expiresAt: link.expiresAt,
      sentTo: value.recipientEmail,
      createdBy: actor.userId,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rtk.release_link_reissued',
        entityType: 'rtk_request',
        entityId: release.requestId,
        after: { releaseId: release.id, sentTo: value.recipientEmail, expiresAt: link.expiresAt },
      },
      signal,
    )
    const sent = await sendReleaseLink(
      mail,
      {
        to: value.recipientEmail,
        number: release.number,
        releasedOn: release.releasedOn,
        attachments: [],
        token: link.token,
        reissued: true,
      },
      signal,
    )
    return sent ? ok({ expiresAt: link.expiresAt }) : err('send_failed')
  })
}
