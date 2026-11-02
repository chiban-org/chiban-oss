import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  abutterListCandidates,
  abutterListRecipients,
  abutterLists,
  applications,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { canonicalJson } from '@/features/export/canonical'
import { assessFees } from '@/features/fees/assess'
import { loadPack } from '@/features/packs/loadPack'
import { mayManageAbutters } from '@/features/rosters/manage'
import { err, ok, type Result } from '@/types/result'
import { applicantParcelIds } from './applicantParcels'
import { finalRecipients, openIncomplete, refreshRecipients } from './draft'
import { getList, type ListSnapshot } from './queries'
import type { Candidate, IncompleteReason } from './types'

export type IssueError =
  | 'forbidden'
  | 'not_found'
  | 'not_draft'
  | 'fees_incomplete'
  | { incomplete: IncompleteReason[] }

export async function issueList(
  db: Db,
  actor: Actor,
  input: { listId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ sha256: string }, IssueError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  return await transactionResult<{ sha256: string }, IssueError>(db, async (tx) => {
    const peek = await getList(tx, input.listId, signal)
    if (peek === null) return err('not_found')
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, peek.applicationId))
      .for('update')
    const list = await getList(tx, input.listId, signal)
    if (list === null) return err('not_found')
    if (list.status !== 'draft') return err('not_draft')
    const owner = await loadApplicationContext(tx, list.applicationId, signal)
    if (owner === null) return err('not_found')
    await refreshRecipients(tx, list, owner.typeBody.classification, now, signal)
    const open = await openIncomplete(tx, list.id)
    if (open.length > 0) return err({ incomplete: open })
    const app = await loadApplicationContext(tx, list.applicationId, signal)
    if (app === null) return err('not_found')
    const rows = await tx
      .select()
      .from(abutterListRecipients)
      .where(eq(abutterListRecipients.listId, list.id))
    const candidates = await tx
      .select()
      .from(abutterListCandidates)
      .where(
        and(eq(abutterListCandidates.listId, list.id), eq(abutterListCandidates.excluded, false)),
      )
    const params = loadPack().abutterParams.find((p) => p.key === list.strategyKey) ?? null
    const snapshot: ListSnapshot = {
      application: {
        id: app.id,
        number: app.number,
        typeKey: app.typeBody.key,
        receivedDate: app.receivedDate,
      },
      applicantParcelIds: await applicantParcelIds(tx, app.id, signal),
      drawnOn: list.drawnOn,
      strategy: { key: list.strategyKey, version: list.strategyVersion, params },
      resolver: { key: list.resolverKey, version: list.resolverVersion },
      layers: list.layers,
      candidates: candidates.map((c) => ({
        parcelId: c.parcelId,
        reasons: c.reasons as Candidate['reasons'],
      })),
      recipients: finalRecipients(rows),
    }
    const sha256 = createHash('sha256').update(canonicalJson(snapshot)).digest('hex')
    await tx
      .update(abutterLists)
      .set({ status: 'superseded', supersededBy: list.id })
      .where(
        and(eq(abutterLists.applicationId, list.applicationId), eq(abutterLists.status, 'issued')),
      )
    await tx
      .update(abutterLists)
      .set({
        status: 'issued',
        issuedBy: actor.userId,
        issuedAt: now,
        snapshot,
        snapshotSha256: sha256,
      })
      .where(eq(abutterLists.id, list.id))
    const assessed = await assessFees(tx, list.applicationId, 'at_notice', actor, signal)
    if (!assessed.ok) return err('fees_incomplete')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'abutters.list.issue',
        entityType: 'abutter_list',
        entityId: list.id,
        after: { version: list.version, sha256, recipients: snapshot.recipients.length },
      },
      signal,
    )
    return ok({ sha256 })
  })
}
