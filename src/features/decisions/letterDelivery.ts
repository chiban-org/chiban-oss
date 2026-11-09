import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import {
  applications,
  type boardDecisions,
  boardMeetings,
  boards,
  documents,
  letterMailings,
  projectParties,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { queueNotification } from '@/features/notifications/queue'
import { type RecipientRole, resolveRecipients } from '@/features/notifications/recipients'
import { townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const LETTER_ROLES: readonly RecipientRole[] = ['applicant', 'agent']

type DecisionRow = typeof boardDecisions.$inferSelect

function letterOf(decision: DecisionRow): string | null {
  const letter = decision.letterDocumentId ?? ''
  return letter === '' ? decision.writtenDecisionDocumentId : letter
}

async function boardNameOf(tx: Tx, meetingId: string): Promise<string | null> {
  const [row] = await tx
    .select({ name: boards.name })
    .from(boardMeetings)
    .innerJoin(boards, eq(boards.id, boardMeetings.boardId))
    .where(eq(boardMeetings.id, meetingId))
  return row?.name ?? null
}

async function lettersParties(tx: Tx, applicationId: string) {
  return await tx
    .select({ id: projectParties.id })
    .from(applications)
    .innerJoin(projectParties, eq(projectParties.projectId, applications.projectId))
    .where(
      and(
        eq(applications.id, applicationId),
        isNull(projectParties.removedAt),
        inArray(projectParties.role, [...LETTER_ROLES]),
      ),
    )
}

export async function deliverDecisionLetter(
  tx: Tx,
  decision: DecisionRow & { filedOn: string },
  signal: AbortSignal,
): Promise<void> {
  const recipients = await resolveRecipients(tx, decision.applicationId, LETTER_ROLES)
  const boardName = await boardNameOf(tx, decision.meetingId)
  await queueNotification(
    tx,
    {
      event: 'decision_filed',
      applicationId: decision.applicationId,
      recipientUserIds: recipients.userIds,
      recipientPartyIds: recipients.partyIds,
      discriminator: decision.id,
      extra: {
        outcomeLabel: OUTCOME_LABELS[decision.outcome],
        filedOn: decision.filedOn,
        ...(boardName === null ? {} : { boardName }),
      },
    },
    signal,
  )
  const letterId = letterOf(decision)
  if (letterId === null) return
  const paper = await lettersParties(tx, decision.applicationId)
  if (paper.length === 0) return
  await tx
    .insert(letterMailings)
    .values(
      paper.map((p) => ({
        applicationId: decision.applicationId,
        decisionId: decision.id,
        partyId: p.id,
        documentId: letterId,
      })),
    )
    .onConflictDoNothing()
}

export interface LetterToMail {
  id: string
  partyName: string
  partyRole: RecipientRole
  documentId: string
  documentTitle: string
  mailedOn: string | null
}

export async function lettersToMail(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<LetterToMail[]> {
  signal.throwIfAborted()
  return await db
    .select({
      id: letterMailings.id,
      partyName: projectParties.name,
      partyRole: projectParties.role,
      documentId: letterMailings.documentId,
      documentTitle: documents.title,
      mailedOn: letterMailings.mailedOn,
    })
    .from(letterMailings)
    .innerJoin(projectParties, eq(projectParties.id, letterMailings.partyId))
    .innerJoin(documents, eq(documents.id, letterMailings.documentId))
    .where(eq(letterMailings.applicationId, applicationId))
    .orderBy(asc(letterMailings.createdAt), asc(projectParties.name))
}

export type MailedError = 'forbidden' | 'not_found' | 'already_mailed' | 'future_date'

export async function recordLetterMailed(
  db: Db,
  actor: Actor,
  input: { mailingId: string; mailedOn: CivilDate; now?: Date },
  signal: AbortSignal,
): Promise<Result<void, MailedError>> {
  signal.throwIfAborted()
  const now = input.now ?? new Date()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<void, MailedError>(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(letterMailings)
      .where(eq(letterMailings.id, input.mailingId))
      .for('update')
    if (row === undefined) return err('not_found')
    if (row.mailedOn !== null) return err('already_mailed')
    if (compareCivil(input.mailedOn, await townToday(tx, now, signal)) > 0) {
      return err('future_date')
    }
    await tx
      .update(letterMailings)
      .set({ mailedOn: input.mailedOn, mailedBy: actor.userId, mailedAt: now })
      .where(eq(letterMailings.id, row.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'decision.letter_mailed',
        entityType: 'application',
        entityId: row.applicationId,
        after: { mailingId: row.id, partyId: row.partyId, mailedOn: input.mailedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}
