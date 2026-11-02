import { civilDateSchema } from '@packs/nh/schema'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, Tx } from '@/db/client'
import {
  RTK_RESPONSE_KINDS,
  rtkReleases,
  rtkRequests,
  rtkTimeStatements,
  rtkWithholdings,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { computeSubjectDue, type SubjectDue } from '@/features/clocks/subjectDue'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { rtkDueContext } from '@/features/rtk/dueContext'
import { buildResponseLetter } from '@/features/rtk/responseLetter'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const RTK_LETTER_SERIES = 'nh.rs.correspondence_administrative'

const ResponseSchema = z.object({
  requestId: z.string().uuid(),
  kind: z.enum(RTK_RESPONSE_KINDS),
  respondedOn: civilDateSchema,
  websiteUrl: z.string().trim().url().max(500).optional(),
  timeStatement: z
    .object({
      statedDate: civilDateSchema,
      delayReason: z.string().trim().min(1).max(2000),
      costEstimate: z
        .array(
          z.object({ label: z.string().trim().min(1).max(200), cents: z.number().int().min(0) }),
        )
        .max(20),
    })
    .optional(),
})

export type FirstResponseError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'future_date'
  | 'before_received'
  | 'already_responded'
  | 'withholding_required'
  | 'stated_date_required'
  | 'website_url_required'
  | 'release_required'

function statedTimeRule() {
  const rule = ruleByKey(loadPack(), 'nh.rtk.stated_time')
  if (rule.kind !== 'clock')
    throw new AppError(ErrorIds.RTK_INVARIANT, 'nh.rtk.stated_time is not a clock')
  return rule
}

export function statedDueFor(respondedOn: CivilDate, statedDate: CivilDate): SubjectDue {
  return computeSubjectDue(statedTimeRule(), respondedOn, rtkDueContext(), {
    statedDue: statedDate,
  })
}

async function countFor(
  tx: Tx,
  table: typeof rtkReleases | typeof rtkWithholdings,
  requestId: string,
): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(table).where(eq(table.requestId, requestId))
  return row?.n ?? 0
}

async function kindPrecondition(
  tx: Tx,
  requestId: string,
  value: z.output<typeof ResponseSchema>,
): Promise<FirstResponseError | null> {
  switch (value.kind) {
    case 'made_available':
      return (await countFor(tx, rtkReleases, requestId)) === 0 ? 'release_required' : null
    case 'website_reference':
      return value.websiteUrl === undefined ? 'website_url_required' : null
    case 'denied':
      return (await countFor(tx, rtkWithholdings, requestId)) === 0 ? 'withholding_required' : null
    case 'time_statement': {
      const statement = value.timeStatement
      const valid =
        statement !== undefined && daysBetween(value.respondedOn, statement.statedDate) >= 0
      return valid ? null : 'stated_date_required'
    }
  }
}

export async function recordFirstResponse(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: z.input<typeof ResponseSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ letterDocumentId: string }, FirstResponseError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ResponseSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult<{ letterDocumentId: string }, FirstResponseError>(
    db,
    async (tx) => {
      const [request] = await tx
        .select()
        .from(rtkRequests)
        .where(eq(rtkRequests.id, value.requestId))
        .for('update')
      if (request === undefined) return err('not_found')
      if (request.status !== 'open') return err('already_responded')
      const today = await townToday(tx, now, signal)
      if (daysBetween(today, value.respondedOn) > 0) return err('future_date')
      if (daysBetween(request.receivedOn as CivilDate, value.respondedOn) < 0) {
        return err('before_received')
      }
      const refused = await kindPrecondition(tx, request.id, value)
      if (refused !== null) return err(refused)
      let statedDue: SubjectDue | null = null
      const statement = value.timeStatement
      if (value.kind === 'time_statement' && statement !== undefined) {
        statedDue = statedDueFor(value.respondedOn, statement.statedDate)
        await tx.insert(rtkTimeStatements).values({
          requestId: request.id,
          statedOn: value.respondedOn,
          statedDate: statement.statedDate,
          delayReason: statement.delayReason,
          costEstimate: statement.costEstimate,
        })
      }
      await tx
        .update(rtkRequests)
        .set({
          status: value.kind === 'time_statement' ? 'awaiting_decision' : 'responded',
          firstResponseOn: value.respondedOn,
          firstResponseKind: value.kind,
          firstResponseUrl: value.kind === 'website_reference' ? (value.websiteUrl ?? null) : null,
          statedDue,
          openDueOn: statedDue === null ? null : statedDue.due,
          rowVersion: request.rowVersion + 1,
        })
        .where(eq(rtkRequests.id, request.id))
      const bytes = await buildResponseLetter(tx, request.id, signal)
      const stored = await storeGeneratedBytes(tx, store, bytes, 'application/pdf', signal)
      const attached = await attachDocument(
        tx,
        actor,
        {
          target: { kind: 'rtk_request', id: request.id },
          title: `Response to request ${request.number}`,
          docKind: 'rtk_letter',
          file: {
            sha256: stored.sha256,
            filename: `${request.number}-response.pdf`,
            contentType: 'application/pdf',
          },
          seriesKey: RTK_LETTER_SERIES,
        },
        signal,
      )
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'rtk.first_response',
          entityType: 'rtk_request',
          entityId: request.id,
          after: { kind: value.kind, respondedOn: value.respondedOn },
        },
        signal,
      )
      return ok({ letterDocumentId: attached.documentId })
    },
  )
}
