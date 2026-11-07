import { and, asc, eq, inArray, max } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { agendaItems, agendas, boardMeetings, documents, hearings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publishedTemplate } from '@/features/templates/findTemplate'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'
import { agendaModelOf } from './agendaMeetingModel'
import { hearingTitle } from './agendaModel'
import { renderAgendaPdf } from './agendaPdf'

export type AgendaError =
  | 'forbidden'
  | 'not_found'
  | 'not_draft'
  | 'already_published'
  | 'empty'
  | 'cancelled_meeting'

export type AgendaItemKind = 'hearing' | 'business' | 'minutes_approval' | 'other'

type ItemRow = typeof agendaItems.$inferSelect

async function allowed(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return await hasCapability(db, actor.userId, 'board.record', signal)
}

async function meetingOpen(
  db: DbOrTx,
  meetingId: string,
): Promise<Result<void, 'not_found' | 'cancelled_meeting'>> {
  const [meeting] = await db
    .select({ status: boardMeetings.status })
    .from(boardMeetings)
    .where(eq(boardMeetings.id, meetingId))
  if (meeting === undefined) return err('not_found')
  return meeting.status === 'cancelled' ? err('cancelled_meeting') : ok(undefined)
}

async function draftAgenda(
  tx: Tx,
  meetingId: string,
): Promise<Result<typeof agendas.$inferSelect, 'not_found' | 'not_draft' | 'cancelled_meeting'>> {
  const open = await meetingOpen(tx, meetingId)
  if (!open.ok) return open
  await tx.insert(agendas).values({ meetingId }).onConflictDoNothing()
  const [agenda] = await tx
    .select()
    .from(agendas)
    .where(eq(agendas.meetingId, meetingId))
    .for('update')
  if (agenda === undefined) return err('not_found')
  return agenda.status === 'draft' ? ok(agenda) : err('not_draft')
}

async function itemsInOrder(tx: Tx, meetingId: string): Promise<ItemRow[]> {
  return await tx
    .select()
    .from(agendaItems)
    .where(eq(agendaItems.meetingId, meetingId))
    .orderBy(asc(agendaItems.position), asc(agendaItems.id))
}

async function renumber(tx: Tx, ordered: ItemRow[]): Promise<void> {
  for (const [position, item] of ordered.entries()) {
    if (item.position !== position) {
      await tx.update(agendaItems).set({ position }).where(eq(agendaItems.id, item.id))
    }
  }
}

async function nextPosition(tx: Tx, meetingId: string): Promise<number> {
  const [row] = await tx
    .select({ top: max(agendaItems.position) })
    .from(agendaItems)
    .where(eq(agendaItems.meetingId, meetingId))
  return row?.top == null ? 0 : row.top + 1
}

export async function buildAgenda(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<{ added: number; onMeeting: number }, AgendaError>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  return await transactionResult<{ added: number; onMeeting: number }, AgendaError>(
    db,
    async (tx) => {
      const agenda = await draftAgenda(tx, meetingId)
      if (!agenda.ok) return agenda
      const present = new Set((await itemsInOrder(tx, meetingId)).map((i) => i.hearingId))
      const scheduled = await tx
        .select()
        .from(hearings)
        .where(
          and(eq(hearings.meetingId, meetingId), inArray(hearings.status, ['scheduled', 'held'])),
        )
        .orderBy(asc(hearings.createdAt), asc(hearings.id))
      let position = await nextPosition(tx, meetingId)
      let added = 0
      for (const hearing of scheduled.filter((h) => !present.has(h.id))) {
        await tx.insert(agendaItems).values({
          meetingId,
          position,
          kind: 'hearing',
          hearingId: hearing.id,
          title: await hearingTitle(tx, hearing.applicationId, hearing.kind, signal),
          description: '',
        })
        position += 1
        added += 1
      }
      return ok({ added, onMeeting: scheduled.length })
    },
  )
}

export async function addAgendaItem(
  db: Db,
  actor: Actor,
  input: { meetingId: string; kind: AgendaItemKind; title: string; description?: string },
  signal: AbortSignal,
): Promise<Result<{ itemId: string }, AgendaError>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  return await transactionResult<{ itemId: string }, AgendaError>(db, async (tx) => {
    const agenda = await draftAgenda(tx, input.meetingId)
    if (!agenda.ok) return agenda
    const [row] = await tx
      .insert(agendaItems)
      .values({
        meetingId: input.meetingId,
        position: await nextPosition(tx, input.meetingId),
        kind: input.kind,
        title: input.title,
        description: input.description ?? '',
      })
      .returning({ id: agendaItems.id })
    return ok({ itemId: row?.id ?? '' })
  })
}

async function itemWithDraftAgenda(tx: Tx, itemId: string) {
  const [item] = await tx.select().from(agendaItems).where(eq(agendaItems.id, itemId))
  if (item === undefined) return err('not_found' as const)
  const agenda = await draftAgenda(tx, item.meetingId)
  return agenda.ok ? ok(item) : agenda
}

export async function moveAgendaItem(
  db: Db,
  actor: Actor,
  input: { itemId: string; toPosition: number },
  signal: AbortSignal,
): Promise<Result<void, AgendaError>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  return await transactionResult<void, AgendaError>(db, async (tx) => {
    const item = await itemWithDraftAgenda(tx, input.itemId)
    if (!item.ok) return item
    const ordered = (await itemsInOrder(tx, item.value.meetingId)).filter(
      (i) => i.id !== item.value.id,
    )
    const target = Math.max(0, Math.min(input.toPosition, ordered.length))
    ordered.splice(target, 0, item.value)
    await renumber(tx, ordered)
    return ok(undefined)
  })
}

export async function removeAgendaItem(
  db: Db,
  actor: Actor,
  itemId: string,
  signal: AbortSignal,
): Promise<Result<void, AgendaError>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  return await transactionResult<void, AgendaError>(db, async (tx) => {
    const item = await itemWithDraftAgenda(tx, itemId)
    if (!item.ok) return item
    await tx.delete(agendaItems).where(eq(agendaItems.id, itemId))
    await renumber(tx, await itemsInOrder(tx, item.value.meetingId))
    return ok(undefined)
  })
}

export async function reopenAgenda(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<void, AgendaError>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  const open = await meetingOpen(db, meetingId)
  if (!open.ok) return open
  const changed = await db
    .update(agendas)
    .set({ status: 'draft' })
    .where(and(eq(agendas.meetingId, meetingId), eq(agendas.status, 'published')))
    .returning({ meetingId: agendas.meetingId })
  return changed.length === 0 ? err('not_found') : ok(undefined)
}

export async function publishAgenda(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<{ documentId: string }, AgendaError>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  return await transactionResult<{ documentId: string }, AgendaError>(db, async (tx) => {
    const [existing] = await tx
      .select()
      .from(agendas)
      .where(eq(agendas.meetingId, meetingId))
      .for('update')
    if (existing?.status === 'published') return err('already_published')
    const agenda = await draftAgenda(tx, meetingId)
    if (!agenda.ok) return agenda
    const items = await itemsInOrder(tx, meetingId)
    if (items.length === 0) return err('empty')
    const [meeting] = await tx.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
    if (meeting === undefined) return err('not_found')
    const date = formatCivilDate(meeting.meetingDate)
    const frame = await documentFrame(tx, { boardId: meeting.boardId }, signal, store)
    const model = await agendaModelOf(tx, meeting, items, signal)
    const template = await publishedTemplate(tx, 'agenda', signal)
    const bytes = await renderAgendaPdf(frame, model, template)
    const stored = await storeGeneratedBytes(tx, store, bytes, 'application/pdf', signal)
    const revision = agenda.value.revision + 1
    const attached = await attachDocument(
      tx,
      actor,
      {
        target: { kind: 'meeting', id: meetingId },
        title: revision === 1 ? `Agenda for ${date}` : `Agenda for ${date}, revision ${revision}`,
        docKind: 'board_material',
        file: {
          sha256: stored.sha256,
          filename: `agenda-${meeting.meetingDate}.pdf`,
          contentType: 'application/pdf',
        },
        audiences: ['board'],
        isPublic: true,
      },
      signal,
    )
    if (agenda.value.documentId !== null) {
      await tx
        .update(documents)
        .set({ isPublic: false })
        .where(eq(documents.id, agenda.value.documentId))
    }
    await tx
      .update(agendas)
      .set({
        status: 'published',
        publishedAt: new Date(),
        documentId: attached.documentId,
        revision,
      })
      .where(eq(agendas.meetingId, meetingId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'agenda.publish',
        entityType: 'board_meeting',
        entityId: meetingId,
        after: { documentId: attached.documentId, revision },
      },
      signal,
    )
    return ok({ documentId: attached.documentId })
  })
}
