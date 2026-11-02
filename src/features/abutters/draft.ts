import { and, asc, eq, notInArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { abutterListCandidates, abutterListRecipients, abutterLists } from '@/db/schema'
import { applicantParcelIds } from '@/features/abutters/applicantParcels'
import { mergeRecipients } from '@/features/abutters/dedupe'
import type { ListRow } from '@/features/abutters/queries'
import { type Recipient, recipientResolver } from '@/features/abutters/resolution'
import type { IncompleteReason } from '@/features/abutters/types'
import { loadPack } from '@/features/packs/loadPack'

export interface StoredIncomplete {
  strategy: IncompleteReason[]
  resolver: IncompleteReason[]
}

export type RecipientRow = typeof abutterListRecipients.$inferSelect

export function classificationSpec(classificationKey: string | undefined) {
  return loadPack().classifications.find((c) => c.key === classificationKey)?.abutters ?? null
}

export function wasCorrected(recipient: Recipient): boolean {
  return recipient.provenance.some((p) => p.source === 'staff_entry')
}

export async function refreshRecipients(
  tx: Tx,
  list: ListRow,
  classificationKey: string | undefined,
  now: Date,
  signal: AbortSignal,
): Promise<void> {
  const spec = classificationSpec(classificationKey)
  if (spec === null) return
  const candidates = await tx
    .select()
    .from(abutterListCandidates)
    .where(
      and(eq(abutterListCandidates.listId, list.id), eq(abutterListCandidates.excluded, false)),
    )
  const output = await recipientResolver(list.resolverKey).resolve(
    tx,
    {
      applicationId: list.applicationId,
      candidates: candidates.map((c) => ({
        parcelId: c.parcelId,
        reasons: c.reasons as never,
      })),
      roles: spec.roles,
      conditionalRoles: spec.conditionalRoles,
      now,
    },
    signal,
  )
  const existing = await tx
    .select()
    .from(abutterListRecipients)
    .where(eq(abutterListRecipients.listId, list.id))
  const held = new Map(existing.map((r) => [r.originKey, r]))
  for (const [position, recipient] of output.recipients.entries()) {
    const row = held.get(recipient.key)
    if (row === undefined) {
      await tx
        .insert(abutterListRecipients)
        .values({ listId: list.id, originKey: recipient.key, position, data: recipient })
    } else {
      const keep = wasCorrected(row.data as Recipient)
      await tx
        .update(abutterListRecipients)
        .set({ position, ...(keep ? {} : { data: recipient }) })
        .where(eq(abutterListRecipients.id, row.id))
    }
  }
  const keys = output.recipients.map((r) => r.key)
  await tx
    .delete(abutterListRecipients)
    .where(
      keys.length === 0
        ? eq(abutterListRecipients.listId, list.id)
        : and(
            eq(abutterListRecipients.listId, list.id),
            notInArray(abutterListRecipients.originKey, keys),
          ),
    )
  const stored = list.incomplete as StoredIncomplete
  await tx
    .update(abutterLists)
    .set({ incomplete: { strategy: stored.strategy, resolver: output.incomplete } })
    .where(eq(abutterLists.id, list.id))
}

export async function openIncomplete(tx: Tx, listId: string): Promise<IncompleteReason[]> {
  const [list] = await tx.select().from(abutterLists).where(eq(abutterLists.id, listId))
  if (list === undefined) return []
  const stored = list.incomplete as StoredIncomplete
  const rows = await tx
    .select()
    .from(abutterListRecipients)
    .where(eq(abutterListRecipients.listId, listId))
    .orderBy(asc(abutterListRecipients.position))
  const corrected = new Set(
    rows
      .filter((r) => wasCorrected(r.data as Recipient))
      .flatMap((r) => (r.data as Recipient).parcelIds),
  )
  const strategy = list.crossingsAttestedAt === null ? stored.strategy : []
  const resolver = stored.resolver.filter(
    (i) => i.parcelId === undefined || !corrected.has(i.parcelId),
  )
  const tenants = rows
    .filter(
      (r) =>
        !r.excluded && (r.data as Recipient).status === 'needs_decision' && r.qualifies === null,
    )
    .map(
      (r): IncompleteReason => ({
        code: 'park_tenants_undecided',
        detail: `Decide whether ${(r.data as Recipient).name} owns manufactured housing that adjoins or is directly across from the property.`,
      }),
    )
  return [...strategy, ...resolver, ...tenants]
}

export function finalRecipients(rows: RecipientRow[]): Recipient[] {
  const kept = rows
    .filter((r) => !r.excluded)
    .sort((a, b) => a.position - b.position)
    .flatMap((r) => {
      const data = r.data as Recipient
      if (data.status !== 'needs_decision' || r.qualifies === true) {
        return [{ ...data, status: 'ok' as const }]
      }
      const roles = data.roles.filter((role) => role !== 'mhp_tenant')
      return roles.length === 0 ? [] : [{ ...data, roles, status: 'ok' as const }]
    })
  return mergeRecipients(kept)
}

export async function applicantParcelsOf(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
): Promise<string[]> {
  return await applicantParcelIds(tx, applicationId, signal)
}
