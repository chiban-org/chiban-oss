import { createHash, randomBytes } from 'node:crypto'
import { civilDateSchema } from '@packs/nh/schema'
import { and, eq, inArray, max } from 'drizzle-orm'
import { z } from 'zod'
import { env } from '@/config/env'
import type { Db, Tx } from '@/db/client'
import {
  documents,
  documentVersions,
  RTK_RELEASE_METHODS,
  redactionBoxes,
  renditionApprovals,
  rtkReleaseItems,
  rtkReleases,
  rtkRequests,
  rtkWithholdings,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { MailTransport } from '@/features/mail/transport'
import { fileRequestLetter } from '@/features/rtk/requestLetter'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const TOKEN_BYTES = 32
const LINK_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const OPEN_STATUSES = ['open', 'awaiting_decision', 'responded']
const REDACTED_ROLES = ['public_redacted', 'release_redacted']

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

export function hashReleaseToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

interface ResolvedItem {
  documentId: string
  approvalId: string
  versionId: string
  role: string
  redactionJobId: string | null
  title: string
}

async function resolveItems(
  tx: Tx,
  requestId: string,
  items: { documentId: string; approvalId: string }[],
): Promise<Result<ResolvedItem[], 'approval_missing' | 'approval_revoked'>> {
  const rows = await tx
    .select({
      approvalId: renditionApprovals.id,
      documentId: renditionApprovals.documentId,
      versionId: renditionApprovals.versionId,
      purpose: renditionApprovals.purpose,
      rtkRequestId: renditionApprovals.rtkRequestId,
      revokedAt: renditionApprovals.revokedAt,
      role: documentVersions.role,
      redactionJobId: documentVersions.redactionJobId,
      title: documents.title,
    })
    .from(renditionApprovals)
    .innerJoin(documentVersions, eq(documentVersions.id, renditionApprovals.versionId))
    .innerJoin(documents, eq(documents.id, renditionApprovals.documentId))
    .where(
      inArray(
        renditionApprovals.id,
        items.map((i) => i.approvalId),
      ),
    )
  const resolved: ResolvedItem[] = []
  for (const item of items) {
    const row = rows.find((r) => r.approvalId === item.approvalId)
    const forThisRequest = row?.purpose === 'public' || row?.rtkRequestId === requestId
    if (row === undefined || row.documentId !== item.documentId || !forThisRequest) {
      return err('approval_missing')
    }
    if (row.revokedAt !== null) return err('approval_revoked')
    resolved.push({
      documentId: row.documentId,
      approvalId: row.approvalId,
      versionId: row.versionId,
      role: row.role,
      redactionJobId: row.redactionJobId,
      title: row.title,
    })
  }
  return ok(resolved)
}

async function withholdingsFor(
  tx: Tx,
  requestId: string,
  releaseId: string,
  actorId: string,
  item: ResolvedItem,
): Promise<boolean> {
  if (!REDACTED_ROLES.includes(item.role)) return true
  if (item.redactionJobId === null) return false
  const boxes = await tx
    .select()
    .from(redactionBoxes)
    .where(eq(redactionBoxes.jobId, item.redactionJobId))
  if (boxes.length === 0) return false
  const groups = new Map<
    string,
    { exemptionKey: string; otherCitation: string | null; explanations: string[] }
  >()
  for (const box of boxes) {
    const key = `${box.exemptionKey}|${box.otherCitation ?? ''}`
    const group = groups.get(key) ?? {
      exemptionKey: box.exemptionKey,
      otherCitation: box.otherCitation,
      explanations: [],
    }
    if (!group.explanations.includes(box.explanation)) group.explanations.push(box.explanation)
    groups.set(key, group)
  }
  await tx.insert(rtkWithholdings).values(
    [...groups.values()].map((g) => ({
      requestId,
      releaseId,
      scope: 'redacted' as const,
      documentId: item.documentId,
      recordDescription: item.title,
      exemptionKey: g.exemptionKey,
      otherCitation: g.otherCitation,
      explanation: g.explanations.join(' '),
      createdBy: actorId,
    })),
  )
  return true
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
): Promise<Result<{ releaseId: string; sequence: number }, ReleaseError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ReleaseSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (value.method === 'electronic_link' && value.recipientEmail === undefined) {
    return err('recipient_required')
  }
  if (new Set(value.items.map((i) => i.documentId)).size !== value.items.length) {
    return err('duplicate_document')
  }
  return await transactionResult<{ releaseId: string; sequence: number }, ReleaseError>(
    db,
    async (tx) => {
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
      const token =
        value.method === 'electronic_link' ? randomBytes(TOKEN_BYTES).toString('base64url') : null
      const [release] = await tx
        .insert(rtkReleases)
        .values({
          requestId: request.id,
          sequence,
          releasedOn: value.releasedOn,
          method: value.method,
          releasedBy: actor.userId,
          linkTokenHash: token === null ? null : hashReleaseToken(token),
          linkExpiresAt: token === null ? null : new Date(now.getTime() + LINK_DAYS * DAY_MS),
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
      if (token !== null && value.recipientEmail !== undefined) {
        const sent = await sendLink(
          mail,
          value.recipientEmail,
          request.number,
          token,
          value.releasedOn,
          signal,
        )
        if (!sent) return err('send_failed')
      }
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'rtk.release',
          entityType: 'rtk_request',
          entityId: request.id,
          after: { releaseId, sequence, method: value.method, items: items.value.length },
        },
        signal,
      )
      return ok({ releaseId, sequence })
    },
  )
}

async function sendLink(
  mail: MailTransport,
  to: string,
  number: string,
  token: string,
  releasedOn: string,
  signal: AbortSignal,
): Promise<boolean> {
  const link = `${env.BASE_URL}/records/releases/${token}`
  const sent = await mail.send(
    {
      to: to.trim().toLowerCase(),
      subject: `Records for request ${number}`,
      text: `The town released records for your Right-to-Know request ${number} on ${formatCivilDate(releasedOn)}. The link works for ${LINK_DAYS} days.\n\n${link}\n`,
      html: `<p>The town released records for your Right-to-Know request ${number} on ${formatCivilDate(releasedOn)}. The link works for ${LINK_DAYS} days.</p><p><a href="${link}">Open the records</a></p>`,
    },
    signal,
  )
  return sent.ok
}
