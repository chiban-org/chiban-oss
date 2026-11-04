import { eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { boardDecisions, boardMeetings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { getVersion } from '@/features/config/store'
import { appealRightsFor } from '@/features/decisions/appealRights'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { formatMinuteOfDay } from '@/features/hearings/labels'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { DocumentFrame } from '@/features/pdf/frame'
import { renderPdf } from '@/features/pdf/renderPdf'
import { loadPermitData, mergeContextOf, NOT_APPLICABLE } from '@/features/permits/permitData'
import type { ObjectStore } from '@/features/storage/objectStore'
import { frameMergeContext } from '@/features/templates/frameFields'
import { renderTemplateText } from '@/features/templates/renderTemplate'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'

export type DocumentsError = 'forbidden' | 'not_found' | 'no_template' | 'already_generated'

export interface DecisionTexts {
  noticeOfDecision: string
  letter: string
  frame: DocumentFrame
  noticeTitle: string
  letterTitle: string
}

async function templateOfKind(
  db: DbOrTx,
  templateIds: string[],
  kind: TemplateBody['kind'],
  signal: AbortSignal,
): Promise<TemplateBody | null> {
  for (const id of templateIds) {
    const version = await getVersion(db, id, signal)
    const body = version?.body as TemplateBody | undefined
    if (body?.kind === kind) return body
  }
  return null
}

export async function renderDecisionTexts(
  db: DbOrTx,
  decisionId: string,
  signal: AbortSignal,
): Promise<Result<DecisionTexts, 'not_found' | 'no_template'>> {
  signal.throwIfAborted()
  const [decision] = await db.select().from(boardDecisions).where(eq(boardDecisions.id, decisionId))
  if (decision === undefined) return err('not_found')
  const app = await loadApplicationContext(db, decision.applicationId, signal)
  const data = await loadPermitData(db, decision.applicationId, signal)
  const [meeting] = await db
    .select()
    .from(boardMeetings)
    .where(eq(boardMeetings.id, decision.meetingId))
  if (app === null || data === null || meeting === undefined) return err('not_found')
  const notice = await templateOfKind(db, app.pins.templates, 'notice_of_decision', signal)
  const letter = await templateOfKind(db, app.pins.templates, 'decision_letter', signal)
  if (notice === null || letter === null) return err('no_template')
  const board = boardOfApplication(app)
  const settings = await getBoardSettings(db, signal)
  const frame = await documentFrame(db, { board }, signal)
  const reasonsText = decision.reasonsForDisapproval?.trim() ?? ''
  const reasons = reasonsText === '' ? null : reasonsText
  const context = {
    ...mergeContextOf(data),
    ...frameMergeContext(frame),
    'board.name': board === null ? '' : boardLabel(settings, board),
    'meeting.date': formatCivilDate(meeting.meetingDate),
    'meeting.location': meeting.location,
    'meeting.time': formatMinuteOfDay(meeting.startsAtMinute),
    'decision.outcome': OUTCOME_LABELS[decision.outcome],
    'decision.votedOn': formatCivilDate(decision.votedOn),
    'decision.findings': decision.findings,
    'decision.conditions':
      decision.conditions.length === 0
        ? NOT_APPLICABLE
        : decision.conditions.map((c) => c.text).join('; '),
    'decision.reasons': reasons ?? NOT_APPLICABLE,
    'decision.conditionsSection':
      decision.conditions.length === 0
        ? ''
        : `Conditions: ${decision.conditions.map((c) => c.text).join('; ')}`,
    'decision.reasonsSection': reasons === null ? '' : `Reasons for disapproval: ${reasons}`,
    'decision.appealRights': appealRightsFor(app.typeBody.classification ?? ''),
  }
  const noticeText = renderTemplateText(notice.body, context)
  const letterText = renderTemplateText(letter.body, context)
  if (!noticeText.ok || !letterText.ok) return err('no_template')
  return ok({
    noticeOfDecision: noticeText.value,
    letter: letterText.value,
    frame,
    noticeTitle: notice.label,
    letterTitle: letter.label,
  })
}

function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((paragraph) => ({ kind: 'paragraph' as const, text: paragraph }))
}

export async function generateDecisionDocuments(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  decisionId: string,
  signal: AbortSignal,
): Promise<Result<{ noticeOfDecisionId: string; letterId: string }, DocumentsError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<{ noticeOfDecisionId: string; letterId: string }, DocumentsError>(
    db,
    async (tx) => {
      const [decision] = await tx
        .select()
        .from(boardDecisions)
        .where(eq(boardDecisions.id, decisionId))
        .for('update')
      if (decision === undefined) return err('not_found')
      if (decision.writtenDecisionDocumentId !== null) return err('already_generated')
      const texts = await renderDecisionTexts(tx, decisionId, signal)
      if (!texts.ok) return texts
      const made: string[] = []
      for (const [title, body] of [
        [texts.value.noticeTitle, texts.value.noticeOfDecision],
        [texts.value.letterTitle, texts.value.letter],
      ] as const) {
        const pdf = await renderPdf({
          title,
          frame: texts.value.frame,
          scale: 'document',
          blocks: paragraphs(body),
        })
        const stored = await storeGeneratedBytes(tx, store, pdf, 'application/pdf', signal)
        const attached = await attachDocument(
          tx,
          actor,
          {
            target: { kind: 'application', id: decision.applicationId },
            title,
            docKind: 'board_material',
            file: {
              sha256: stored.sha256,
              filename: `${decision.id}-${made.length}.pdf`,
              contentType: 'application/pdf',
            },
            audiences: ['project_parties'],
            isPublic: false,
          },
          signal,
        )
        made.push(attached.documentId)
      }
      const [noticeOfDecisionId = '', letterId = ''] = made
      await tx
        .update(boardDecisions)
        .set({ writtenDecisionDocumentId: noticeOfDecisionId, letterDocumentId: letterId })
        .where(eq(boardDecisions.id, decisionId))
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'decision.documents',
          entityType: 'application',
          entityId: decision.applicationId,
          after: { decisionId, noticeOfDecisionId, letterId },
        },
        signal,
      )
      return ok({ noticeOfDecisionId, letterId })
    },
  )
}
