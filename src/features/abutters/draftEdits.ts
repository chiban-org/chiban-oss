import { and, desc, eq, ne } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import {
  abutterListCandidates,
  abutterListRecipients,
  abutterLists,
  applications,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { lockApplication } from '@/features/applications/lockApplication'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { getBoardSettings } from '@/features/boards/boardSettings'
import { mayManageAbutters } from '@/features/rosters/manage'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'
import { applicantParcelIds } from './applicantParcels'
import { classificationSpec, refreshRecipients, type StoredIncomplete } from './draft'
import { getList, type ListRow } from './queries'
import { abutterStrategy } from './registry'
import type { Recipient } from './resolution'
import type { Candidate, CrossingKind, StaffSelection } from './types'
import './registerNh'

export type DraftError = 'forbidden' | 'not_found' | 'not_draft'

async function openDraft(
  tx: Tx,
  listId: string,
  signal: AbortSignal,
): Promise<Result<{ list: ListRow; classificationKey: string | undefined }, DraftError>> {
  const list = await getList(tx, listId, signal)
  if (list === null) return err('not_found')
  if (list.status !== 'draft') return err('not_draft')
  const app = await loadApplicationContext(tx, list.applicationId, signal)
  return ok({ list, classificationKey: app?.typeBody.classification })
}

async function mutateDraft(
  db: Db,
  actor: Actor,
  listId: string,
  action: string,
  change: (tx: Tx, list: ListRow) => Promise<Result<unknown, DraftError>>,
  signal: AbortSignal,
  now: Date,
  after: unknown,
): Promise<Result<void, DraftError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  return await transactionResult<void, DraftError>(db, async (tx) => {
    const peek = await getList(tx, listId, signal)
    if (peek === null) return err('not_found')
    await lockApplication(tx, peek.applicationId)
    const opened = await openDraft(tx, listId, signal)
    if (!opened.ok) return opened
    const changed = await change(tx, opened.value.list)
    if (!changed.ok) return changed
    const fresh = (await getList(tx, listId, signal)) ?? opened.value.list
    await refreshRecipients(tx, fresh, opened.value.classificationKey, now, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `abutters.${action}`,
        entityType: 'abutter_list',
        entityId: listId,
        after,
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function selectParcel(
  db: Db,
  actor: Actor,
  input: { listId: string; parcelId: string; crossing: CrossingKind; note: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, DraftError | 'note_required'>> {
  const note = input.note.trim()
  if (note === '') return err('note_required')
  return await mutateDraft(
    db,
    actor,
    input.listId,
    'candidate.select',
    async (tx) => {
      const reason = { kind: 'staff_selected', crossing: input.crossing, note, by: actor.userId }
      const [existing] = await tx
        .select()
        .from(abutterListCandidates)
        .where(
          and(
            eq(abutterListCandidates.listId, input.listId),
            eq(abutterListCandidates.parcelId, input.parcelId),
          ),
        )
      if (existing === undefined) {
        await tx
          .insert(abutterListCandidates)
          .values({ listId: input.listId, parcelId: input.parcelId, reasons: [reason] })
      } else {
        await tx
          .update(abutterListCandidates)
          .set({
            reasons: [
              reason,
              ...(existing.reasons as unknown[]).filter(
                (r) => (r as { kind: string }).kind !== 'staff_selected',
              ),
            ],
            excluded: false,
            exclusionReason: null,
          })
          .where(eq(abutterListCandidates.id, existing.id))
      }
      return ok(undefined)
    },
    signal,
    now,
    { parcelId: input.parcelId, crossing: input.crossing, note },
  )
}

export async function excludeCandidate(
  db: Db,
  actor: Actor,
  input: { listId: string; parcelId: string; reason: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, DraftError | 'reason_required'>> {
  const reason = input.reason.trim()
  if (reason === '') return err('reason_required')
  return await mutateDraft(
    db,
    actor,
    input.listId,
    'candidate.exclude',
    async (tx) => {
      await tx
        .update(abutterListCandidates)
        .set({ excluded: true, exclusionReason: reason })
        .where(
          and(
            eq(abutterListCandidates.listId, input.listId),
            eq(abutterListCandidates.parcelId, input.parcelId),
          ),
        )
      return ok(undefined)
    },
    signal,
    now,
    { parcelId: input.parcelId, reason },
  )
}

export async function correctRecipient(
  db: Db,
  actor: Actor,
  input: {
    listId: string
    recipientId: string
    name: string
    mailingAddress: string
    reason: string
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, DraftError | 'reason_required' | 'name_and_address_required'>> {
  const reason = input.reason.trim()
  if (reason === '') return err('reason_required')
  if (input.name.trim() === '' || input.mailingAddress.trim() === '') {
    return err('name_and_address_required')
  }
  return await mutateDraft(
    db,
    actor,
    input.listId,
    'recipient.correct',
    async (tx) => {
      const [row] = await tx
        .select()
        .from(abutterListRecipients)
        .where(
          and(
            eq(abutterListRecipients.id, input.recipientId),
            eq(abutterListRecipients.listId, input.listId),
          ),
        )
      if (row === undefined) return err('not_found')
      const before = row.data as Recipient
      const today = await townToday(tx, now, signal)
      const data: Recipient = {
        ...before,
        name: input.name.trim(),
        mailingAddress: input.mailingAddress.trim(),
        status: before.status === 'needs_decision' ? 'needs_decision' : 'ok',
        provenance: [
          ...before.provenance,
          {
            source: 'staff_entry',
            ref: actor.userId,
            asOf: today,
            ageDays: 0,
            state: 'entered',
            replaced: { name: before.name, mailingAddress: before.mailingAddress },
            reason,
          },
        ],
      }
      await tx
        .update(abutterListRecipients)
        .set({ data })
        .where(eq(abutterListRecipients.id, row.id))
      return ok(undefined)
    },
    signal,
    now,
    { recipientId: input.recipientId, reason },
  )
}

export async function decideTenant(
  db: Db,
  actor: Actor,
  input: { listId: string; recipientId: string; qualifies: boolean; reason: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, DraftError | 'reason_required'>> {
  const reason = input.reason.trim()
  if (reason === '') return err('reason_required')
  return await mutateDraft(
    db,
    actor,
    input.listId,
    'tenant.decide',
    async (tx) => {
      const updated = await tx
        .update(abutterListRecipients)
        .set({ qualifies: input.qualifies, decisionReason: reason })
        .where(
          and(
            eq(abutterListRecipients.id, input.recipientId),
            eq(abutterListRecipients.listId, input.listId),
          ),
        )
        .returning({ id: abutterListRecipients.id })
      return updated.length === 0 ? err('not_found') : ok(undefined)
    },
    signal,
    now,
    { recipientId: input.recipientId, qualifies: input.qualifies, reason },
  )
}

export async function attestCrossings(
  db: Db,
  actor: Actor,
  input: { listId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, DraftError>> {
  return await mutateDraft(
    db,
    actor,
    input.listId,
    'crossings.attest',
    async (tx) => {
      await tx
        .update(abutterLists)
        .set({ crossingsAttestedBy: actor.userId, crossingsAttestedAt: now })
        .where(eq(abutterLists.id, input.listId))
      return ok(undefined)
    },
    signal,
    now,
    {},
  )
}
