import { and, desc, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
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
import { getBoardSettings } from '@/features/boards/boardSettings'
import { mayManageAbutters } from '@/features/rosters/manage'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'
import { applicantParcelIds } from './applicantParcels'
import { carryExclusions, carryRecipientEdits } from './carryEdits'
import { classificationSpec, refreshRecipients, type StoredIncomplete } from './draft'
import { getList, type ListRow } from './queries'
import { abutterStrategy } from './registry'
import type { Recipient } from './resolution'
import type { Candidate, CrossingKind, StaffSelection } from './types'
import './registerNh'

function staffSelectionsOf(
  candidates: { parcelId: string; reasons: unknown; excluded: boolean }[],
) {
  return candidates.flatMap((c) =>
    (c.reasons as Candidate['reasons'])
      .filter((r) => r.kind === 'staff_selected')
      .map(
        (r): StaffSelection => ({
          parcelId: c.parcelId,
          crossing: (r as { crossing: CrossingKind }).crossing,
          note: (r as { note: string }).note,
          by: (r as { by: string }).by,
        }),
      ),
  )
}

export async function generateList(
  db: Db,
  actor: Actor,
  input: { applicationId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    { listId: string; version: number },
    'forbidden' | 'not_found' | 'not_board' | 'parcel_layer_unavailable'
  >
> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const spec = classificationSpec(app.typeBody.classification)
    if (spec === null) return err('not_board')
    const [latest] = await tx
      .select()
      .from(abutterLists)
      .where(eq(abutterLists.applicationId, app.id))
      .orderBy(desc(abutterLists.version))
      .limit(1)
    const carried =
      latest === undefined
        ? []
        : staffSelectionsOf(
            await tx
              .select()
              .from(abutterListCandidates)
              .where(eq(abutterListCandidates.listId, latest.id)),
          )
    const strategy = abutterStrategy(spec.strategyKey)
    const selection = await strategy.select(
      tx,
      {
        applicationId: app.id,
        applicantParcelIds: await applicantParcelIds(tx, app.id, signal),
        staffSelections: carried,
        crossingsAttested: false,
        settings: (await getBoardSettings(tx, signal)).abutters,
        now,
      },
      signal,
    )
    if (selection.incomplete.some((i) => i.code === 'parcel_layer_unavailable')) {
      return err('parcel_layer_unavailable')
    }
    await tx
      .update(abutterLists)
      .set({ status: 'discarded' })
      .where(and(eq(abutterLists.applicationId, app.id), eq(abutterLists.status, 'draft')))
    const [highest] = await tx
      .select({ version: abutterLists.version })
      .from(abutterLists)
      .where(eq(abutterLists.applicationId, app.id))
      .orderBy(desc(abutterLists.version))
      .limit(1)
    const version = (highest?.version ?? 0) + 1
    const incomplete: StoredIncomplete = { strategy: selection.incomplete, resolver: [] }
    const [created] = await tx
      .insert(abutterLists)
      .values({
        applicationId: app.id,
        version,
        strategyKey: strategy.key,
        strategyVersion: strategy.version,
        resolverKey: spec.resolverKey,
        resolverVersion: 1,
        drawnOn: await townToday(tx, now, signal),
        layers: selection.layers,
        incomplete,
        createdBy: actor.userId,
      })
      .returning()
    if (created === undefined) return err('not_found')
    if (selection.candidates.length > 0) {
      await tx.insert(abutterListCandidates).values(
        selection.candidates.map((c) => ({
          listId: created.id,
          parcelId: c.parcelId,
          reasons: c.reasons,
        })),
      )
    }
    if (latest !== undefined) await carryExclusions(tx, latest.id, created.id)
    await refreshRecipients(tx, created, app.typeBody.classification, now, signal)
    if (latest !== undefined) await carryRecipientEdits(tx, latest.id, created.id)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'abutters.list.generate',
        entityType: 'abutter_list',
        entityId: created.id,
        after: { applicationId: app.id, version, candidates: selection.candidates.length },
      },
      signal,
    )
    return ok({ listId: created.id, version })
  })
}

export * from './draftEdits'
