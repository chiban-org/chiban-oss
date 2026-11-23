import { asc, eq } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { applications, incompleteNotices } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { completenessStepFor } from '@/features/applications/completenessStep'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayMarkComplete } from '@/features/building/completeness'
import { keysSatisfiedByCompletion } from '@/features/clocks/ruleEngine'
import { markClockMet } from '@/features/clocks/startClocks'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { loadPack } from '@/features/packs/loadPack'
import { documentFrame } from '@/features/pdf/documentFrame'
import { loadPermitData, mergeContextOf } from '@/features/permits/permitData'
import { plumbingSignerOverride } from '@/features/permits/plumbingSigner'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townTemplate } from '@/features/templates/findTemplate'
import { renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const INCOMPLETE_NOTICE_ACTION = 'application.incomplete_notice'

export type IncompleteNoticeError =
  | 'forbidden'
  | 'not_found'
  | 'not_applicable'
  | 'not_submitted'
  | 'already_complete'
  | 'reason_required'

export interface IncompleteNoticeRow {
  id: string
  sentOn: string
  reason: string
  documentId: string | null
}

export function offersIncompleteNotice(classification: string | null | undefined): boolean {
  return completenessStepFor(classification) === 'meets_completeness_clock'
}

function refusal(app: ApplicationContext | null): IncompleteNoticeError | null {
  if (app === null) return 'not_found'
  if (!offersIncompleteNotice(app.typeBody.classification)) return 'not_applicable'
  if (app.completedDate !== null) return 'already_complete'
  if (app.state !== 'submitted' || app.receivedDate === null) return 'not_submitted'
  return null
}

async function renderNotice(
  tx: Tx,
  app: ApplicationContext,
  notice: { reason: string; sentOn: CivilDate },
  signal: AbortSignal,
): Promise<Uint8Array> {
  const data = await loadPermitData(tx, app.id, signal)
  const template = await townTemplate(tx, 'incomplete_notice', app.pins.templates, signal)
  const frame = await documentFrame(tx, {}, signal)
  return await renderDocumentOrDefault('incomplete_notice', template, {
    subtitle: app.number,
    frame,
    context: {
      ...plumbingSignerOverride('incomplete_notice', app.typeBody.classification, frame),
      values: {
        ...(data === null ? {} : mergeContextOf(data)),
        'application.number': app.number,
        'incomplete.reason': notice.reason,
        'incomplete.sentOn': formatCivilDate(notice.sentOn),
      },
    },
  })
}

async function storeNotice(
  tx: Tx,
  actor: Actor,
  target: { app: ApplicationContext; store: ObjectStore; bytes: Uint8Array },
  signal: AbortSignal,
): Promise<string> {
  const { app, store, bytes } = target
  const stored = await storeGeneratedBytes(tx, store, bytes, 'application/pdf', signal)
  const attached = await attachDocument(
    tx,
    actor,
    {
      target: { kind: 'application', id: app.id },
      title: `Incomplete application notice ${app.number}`,
      docKind: 'attachment',
      file: {
        sha256: stored.sha256,
        filename: `${app.number}-incomplete-notice.pdf`,
        contentType: 'application/pdf',
      },
      audiences: ['project_parties'],
      isPublic: false,
    },
    signal,
  )
  return attached.documentId
}

export interface NoticeEnv {
  store: ObjectStore
  signal: AbortSignal
  now?: Date
}

export async function sendIncompleteNotice(
  db: DbOrTx,
  actor: Actor,
  input: { applicationId: string; reason: string },
  env: NoticeEnv,
): Promise<Result<{ noticeId: string; documentId: string }, IncompleteNoticeError>> {
  const { store, signal, now = new Date() } = env
  signal.throwIfAborted()
  const reason = input.reason.trim()
  if (reason === '') return err('reason_required')
  if (!(await mayMarkComplete(db, actor, input.applicationId, signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    const refused = refusal(app)
    if (refused !== null || app === null) return err(refused ?? 'not_found')
    const sentOn = await townToday(tx, now, signal)
    const bytes = await renderNotice(tx, app, { reason, sentOn }, signal)
    const documentId = await storeNotice(tx, actor, { app, store, bytes }, signal)
    const [row] = await tx
      .insert(incompleteNotices)
      .values({ applicationId: app.id, sentOn, reason, documentId, createdBy: actor.userId })
      .returning({ id: incompleteNotices.id })
    for (const key of keysSatisfiedByCompletion(loadPack().rules)) {
      await markClockMet(tx, app.id, key, sentOn, signal)
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: INCOMPLETE_NOTICE_ACTION,
        entityType: 'application',
        entityId: app.id,
        after: { noticeId: row?.id, documentId, sentOn, reason },
      },
      signal,
    )
    return ok({ noticeId: row?.id ?? '', documentId })
  })
}

export async function listIncompleteNotices(
  db: DbOrTx,
  applicationId: string,
): Promise<IncompleteNoticeRow[]> {
  return await db
    .select({
      id: incompleteNotices.id,
      sentOn: incompleteNotices.sentOn,
      reason: incompleteNotices.reason,
      documentId: incompleteNotices.documentId,
    })
    .from(incompleteNotices)
    .where(eq(incompleteNotices.applicationId, applicationId))
    .orderBy(asc(incompleteNotices.createdAt))
}
