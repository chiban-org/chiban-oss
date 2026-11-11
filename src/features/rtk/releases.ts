import { civilDateSchema } from '@packs/nh/schema'
import { eq, max } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, Tx } from '@/db/client'
import { RTK_RELEASE_METHODS, rtkReleaseItems, rtkReleases, rtkRequests } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { MailTransport } from '@/features/mail/transport'
import { planDelivery, type ReleaseDelivery, sendRelease } from '@/features/rtk/releaseDelivery'
import { resolveItems, withholdingsFor } from '@/features/rtk/releaseItems'
import { fileRequestLetter } from '@/features/rtk/requestLetter'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const OPEN_STATUSES = ['open', 'awaiting_decision', 'responded']
const NEEDS_RECIPIENT = ['electronic_link', 'email']

const ReleaseSchema = z.object({
  requestId: z.string().uuid(),
  releasedOn: civilDateSchema,
  method: z.enum(RTK_RELEASE_METHODS),
  items: z
    .array(z.object({ documentId: z.string().uuid(), approvalId: z.string().uuid() }))
    .min(1)
    .max(500),
  recipientEmail: z.string().trim().email().max(320).optional(),
})

export type ReleaseInput = z.input<typeof ReleaseSchema>

export type ReleaseError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'not_open'
  | 'future_date'
  | 'before_received'
  | 'approval_missing'
  | 'approval_revoked'
  | 'duplicate_document'
  | 'redaction_not_cited'
  | 'recipient_required'
  | 'send_failed'

export interface ReleaseDone {
  releaseId: string
  sequence: number
  delivery: ReleaseDelivery
}

async function checkReleaseDate(
  tx: Tx,
  receivedOn: CivilDate,
  releasedOn: CivilDate,
  now: Date,
  signal: AbortSignal,
): Promise<'future_date' | 'before_received' | null> {
  if (daysBetween(await townToday(tx, now, signal), releasedOn) > 0) return 'future_date'
  return daysBetween(receivedOn, releasedOn) < 0 ? 'before_received' : null
}

export async function createRelease(
  db: Db,
  store: ObjectStore,
  mail: MailTransport,
  actor: Actor,
  input: ReleaseInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<ReleaseDone, ReleaseError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ReleaseSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (NEEDS_RECIPIENT.includes(value.method) && value.recipientEmail === undefined) {
    return err('recipient_required')
  }
  if (new Set(value.items.map((i) => i.documentId)).size !== value.items.length) {
    return err('duplicate_document')
  }
  return await transactionResult<ReleaseDone, ReleaseError>(db, async (tx) => {
    const [request] = await tx
      .select()
      .from(rtkRequests)
      .where(eq(rtkRequests.id, value.requestId))
      .for('update')
    if (request === undefined) return err('not_found')
    if (!OPEN_STATUSES.includes(request.status)) return err('not_open')
    const dated = await checkReleaseDate(
      tx,
      request.receivedOn as CivilDate,
      value.releasedOn,
      now,
      signal,
    )
    if (dated !== null) return err(dated)
    const items = await resolveItems(tx, value.requestId, value.items)
    if (!items.ok) return err(items.error)
    const [last] = await tx
      .select({ n: max(rtkReleases.sequence) })
      .from(rtkReleases)
      .where(eq(rtkReleases.requestId, request.id))
    const sequence = (last?.n ?? 0) + 1
    const plan = await planDelivery(
      tx,
      {
        method: value.method,
        recipientEmail: value.recipientEmail,
        versionIds: items.value.map((i) => i.versionId),
      },
      now,
    )
    const [release] = await tx
      .insert(rtkReleases)
      .values({
        requestId: request.id,
        sequence,
        releasedOn: value.releasedOn,
        method: value.method,
        releasedBy: actor.userId,
        linkTokenHash: plan.link?.hash ?? null,
        linkExpiresAt: plan.link?.expiresAt ?? null,
      })
      .returning({ id: rtkReleases.id })
    const releaseId = release?.id ?? ''
    for (const item of items.value) {
      const cited = await withholdingsFor(tx, request.id, releaseId, actor.userId, item)
      if (!cited) return err('redaction_not_cited')
    }
    await tx.insert(rtkReleaseItems).values(
      items.value.map((item, position) => ({
        releaseId,
        documentId: item.documentId,
        versionId: item.versionId,
        approvalId: item.approvalId,
        position,
      })),
    )
    if (request.status !== 'responded') {
      await tx
        .update(rtkRequests)
        .set({
          status: 'responded',
          firstResponseOn: request.firstResponseOn ?? value.releasedOn,
          firstResponseKind: request.firstResponseKind ?? 'made_available',
          openDueOn: null,
          rowVersion: request.rowVersion + 1,
        })
        .where(eq(rtkRequests.id, request.id))
    }
    const letterDocumentId = await fileRequestLetter(
      tx,
      { store, actor, signal },
      {
        requestId: request.id,
        title: `Response to request ${request.number}, release ${sequence}`,
        filename: `${request.number}-release-${sequence}.pdf`,
      },
    )
    await tx.update(rtkReleases).set({ letterDocumentId }).where(eq(rtkReleases.id, releaseId))
    const delivered = await sendRelease(tx, { store, mail, signal, now }, plan, {
      releaseId,
      number: request.number,
      releasedOn: value.releasedOn,
      letterDocumentId,
    })
    if (!delivered.ok) return err(delivered.error)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rtk.release',
        entityType: 'rtk_request',
        entityId: request.id,
        after: {
          releaseId,
          sequence,
          method: value.method,
          items: items.value.length,
          delivery: plan.delivery,
        },
      },
      signal,
    )
    return ok({ releaseId, sequence, delivery: plan.delivery })
  })
}
