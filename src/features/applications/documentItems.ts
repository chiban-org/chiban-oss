import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applicationDocumentItems, applicationDocumentLinks } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { hasFullRecordAccess } from '@/features/access/roles'
import {
  documentOnApplication,
  type ItemError,
  type ItemRole,
  itemTarget,
} from '@/features/applications/documentItemAccess'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { err, ok, type Result } from '@/types/result'

export type { ItemError } from '@/features/applications/documentItemAccess'

export interface ItemRef {
  applicationId: string
  itemKey: string
}

export const DOCUMENT_ITEM_ACTIONS = {
  link: 'application.document_item.link',
  unlink: 'application.document_item.unlink',
  waiver: 'application.document_item.waiver_request',
  withdrawWaiver: 'application.document_item.waiver_withdraw',
  accept: 'application.document_item.accept',
  undoAccept: 'application.document_item.accept_undo',
} as const

type ItemPatch = Partial<typeof applicationDocumentItems.$inferInsert>

function filingRole(actor: Actor): ItemRole {
  return hasFullRecordAccess(actor) ? 'staff_files' : 'applicant'
}

async function audit(
  tx: Tx,
  actor: Actor,
  entry: { action: string; ref: ItemRef; after: Record<string, unknown> },
  signal: AbortSignal,
): Promise<void> {
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: entry.action,
      entityType: 'application',
      entityId: entry.ref.applicationId,
      after: { itemKey: entry.ref.itemKey, ...entry.after },
    },
    signal,
  )
}

export async function insertItemLink(
  tx: Tx,
  actor: Actor,
  input: ItemRef & { documentId: string },
  signal: AbortSignal,
): Promise<void> {
  await tx
    .insert(applicationDocumentLinks)
    .values({
      applicationId: input.applicationId,
      itemKey: input.itemKey,
      documentId: input.documentId,
      linkedBy: actor.userId,
    })
    .onConflictDoNothing()
  await audit(
    tx,
    actor,
    { action: DOCUMENT_ITEM_ACTIONS.link, ref: input, after: { documentId: input.documentId } },
    signal,
  )
}

export async function linkDocument(
  db: Db,
  actor: Actor,
  input: ItemRef & { documentId: string },
  signal: AbortSignal,
): Promise<Result<void, ItemError>> {
  signal.throwIfAborted()
  return await transactionResult<void, ItemError>(db, async (tx) => {
    const target = await itemTarget(tx, actor, { ...input, role: filingRole(actor) }, signal)
    if (!target.ok) return err(target.error)
    if (!(await documentOnApplication(tx, actor, input.applicationId, input.documentId))) {
      return err('document_not_found')
    }
    await insertItemLink(tx, actor, input, signal)
    return ok(undefined)
  })
}

export async function unlinkDocument(
  db: Db,
  actor: Actor,
  input: ItemRef & { documentId: string },
  signal: AbortSignal,
): Promise<Result<void, ItemError>> {
  signal.throwIfAborted()
  return await transactionResult<void, ItemError>(db, async (tx) => {
    const target = await itemTarget(tx, actor, { ...input, role: filingRole(actor) }, signal)
    if (!target.ok) return err(target.error)
    const removed = await tx
      .delete(applicationDocumentLinks)
      .where(
        and(
          eq(applicationDocumentLinks.applicationId, input.applicationId),
          eq(applicationDocumentLinks.itemKey, input.itemKey),
          eq(applicationDocumentLinks.documentId, input.documentId),
        ),
      )
      .returning({ id: applicationDocumentLinks.id })
    if (removed.length === 0) return err('document_not_found')
    await audit(
      tx,
      actor,
      { action: DOCUMENT_ITEM_ACTIONS.unlink, ref: input, after: { documentId: input.documentId } },
      signal,
    )
    return ok(undefined)
  })
}

async function upsertItem(tx: Tx, ref: ItemRef, patch: ItemPatch): Promise<void> {
  await tx
    .insert(applicationDocumentItems)
    .values({ applicationId: ref.applicationId, itemKey: ref.itemKey, ...patch })
    .onConflictDoUpdate({
      target: [applicationDocumentItems.applicationId, applicationDocumentItems.itemKey],
      set: patch,
    })
}

interface ItemChange {
  role: ItemRole
  action: string
  patch: ItemPatch
  needsWaivable?: boolean
  reason?: string
}

async function changeItem(
  db: Db,
  actor: Actor,
  input: ItemRef & ItemChange,
  signal: AbortSignal,
): Promise<Result<void, ItemError>> {
  signal.throwIfAborted()
  return await transactionResult<void, ItemError>(db, async (tx) => {
    const target = await itemTarget(tx, actor, input, signal)
    if (!target.ok) return err(target.error)
    if (input.needsWaivable === true && !target.value.item.waivable) return err('not_waivable')
    await upsertItem(tx, input, input.patch)
    const after = input.reason === undefined ? {} : { reason: input.reason }
    await audit(tx, actor, { action: input.action, ref: input, after }, signal)
    return ok(undefined)
  })
}

export async function requestWaiver(
  db: Db,
  actor: Actor,
  input: ItemRef & { reason: string },
  signal: AbortSignal,
): Promise<Result<void, ItemError>> {
  return await changeItem(
    db,
    actor,
    {
      ...input,
      role: filingRole(actor),
      action: DOCUMENT_ITEM_ACTIONS.waiver,
      needsWaivable: true,
      patch: {
        waiverReason: input.reason,
        waiverRequestedBy: actor.userId,
        waiverRequestedAt: new Date(),
      },
    },
    signal,
  )
}

export async function withdrawWaiver(
  db: Db,
  actor: Actor,
  input: ItemRef,
  signal: AbortSignal,
): Promise<Result<void, ItemError>> {
  return await changeItem(
    db,
    actor,
    {
      ...input,
      role: filingRole(actor),
      action: DOCUMENT_ITEM_ACTIONS.withdrawWaiver,
      patch: { waiverReason: null, waiverRequestedBy: null, waiverRequestedAt: null },
    },
    signal,
  )
}

export async function acceptWithoutDocument(
  db: Db,
  actor: Actor,
  input: ItemRef & { reason: string },
  signal: AbortSignal,
): Promise<Result<void, ItemError>> {
  return await changeItem(
    db,
    actor,
    {
      ...input,
      role: 'staff_accepts',
      action: DOCUMENT_ITEM_ACTIONS.accept,
      patch: { acceptedReason: input.reason, acceptedBy: actor.userId, acceptedAt: new Date() },
    },
    signal,
  )
}

export async function undoAcceptance(
  db: Db,
  actor: Actor,
  input: ItemRef,
  signal: AbortSignal,
): Promise<Result<void, ItemError>> {
  return await changeItem(
    db,
    actor,
    {
      ...input,
      role: 'staff_accepts',
      action: DOCUMENT_ITEM_ACTIONS.undoAccept,
      patch: { acceptedReason: null, acceptedBy: null, acceptedAt: null },
    },
    signal,
  )
}
