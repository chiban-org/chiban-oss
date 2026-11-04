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
import { appealRightsFor } from '@/features/decisions/appealRights'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { formatMinuteOfDay } from '@/features/hearings/labels'
import { documentFrame } from '@/features/pdf/documentFrame'
import { loadPermitData, mergeContextOf, NOT_APPLICABLE } from '@/features/permits/permitData'
import type { ObjectStore } from '@/features/storage/objectStore'
import { pinnedTemplate } from '@/features/templates/findTemplate'
import { type DocumentInput, renderDocument } from '@/features/templates/templateBlocks'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'

export type DocumentsError = 'forbidden' | 'not_found' | 'no_template' | 'already_generated'

export interface DecisionPdf {
  title: string
  bytes: Uint8Array
}

const DECISION_KINDS = ['notice_of_decision', 'decision_letter'] as const

export async function decisionDocumentInput(
  db: DbOrTx,
  decisionId: string,
  signal: AbortSignal,
): Promise<Result<{ input: DocumentInput; pins: string[] }, 'not_found'>> {
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
  const board = boardOfApplication(app)
  const settings = await getBoardSettings(db, signal)
  const frame = await documentFrame(db, { board }, signal)
  const reasonsText = decision.reasonsForDisapproval?.trim() ?? ''
  const reasons = reasonsText === '' ? null : reasonsText
  const conditions = decision.conditions.map((c) => c.text)
  const appealRights = appealRightsFor(app.typeBody.classification ?? '')
  const values = {
    ...mergeContextOf(data),
    'board.name': board === null ? '' : boardLabel(settings, board),
    'meeting.date': formatCivilDate(meeting.meetingDate),
    'meeting.location': meeting.location,
    'meeting.time': formatMinuteOfDay(meeting.startsAtMinute),
    'decision.outcome': OUTCOME_LABELS[decision.outcome],
    'decision.votedOn': formatCivilDate(decision.votedOn),
    'decision.findings': decision.findings,
    'decision.conditions': conditions.length === 0 ? NOT_APPLICABLE : conditions.join('; '),
    'decision.reasons': reasons ?? NOT_APPLICABLE,
    'decision.conditionsSection':
      conditions.length === 0 ? '' : `Conditions: ${conditions.join('; ')}`,
    'decision.reasonsSection': reasons === null ? '' : `Reasons for disapproval: ${reasons}`,
    'decision.appealRights': appealRights,
  }
  return ok({
    input: {
      frame,
      context: { values, conditions, locked: new Map([['decision.appealRights', appealRights]]) },
    },
    pins: app.pins.templates,
  })
}

export async function renderDecisionPdfs(
  db: DbOrTx,
  decisionId: string,
  signal: AbortSignal,
): Promise<Result<DecisionPdf[], 'not_found' | 'no_template'>> {
  const loaded = await decisionDocumentInput(db, decisionId, signal)
  if (!loaded.ok) return loaded
  const pdfs: DecisionPdf[] = []
  for (const kind of DECISION_KINDS) {
    const template = await pinnedTemplate(db, loaded.value.pins, kind, signal)
    if (template === null) return err('no_template')
    const rendered = await renderDocument(kind, template, loaded.value.input)
    if (!rendered.ok) return err('no_template')
    pdfs.push({ title: template.label, bytes: rendered.value })
  }
  return ok(pdfs)
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
      const pdfs = await renderDecisionPdfs(tx, decisionId, signal)
      if (!pdfs.ok) return pdfs
      const made: string[] = []
      for (const { title, bytes: pdf } of pdfs.value) {
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
