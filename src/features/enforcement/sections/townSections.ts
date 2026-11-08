import { and, eq, ne, sql } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { type TownSectionKind, type TownSectionRow, townSections } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

export interface TownSectionInput {
  provisionKind: TownSectionKind
  reference: string
  title: string
}

export type SaveSectionError = 'forbidden' | 'reference_taken' | 'not_found' | 'retired'

async function lockSections(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('town_sections.references'))`)
}

async function referenceTaken(tx: Tx, input: TownSectionInput, exceptId?: string) {
  const [row] = await tx
    .select({ id: townSections.id })
    .from(townSections)
    .where(
      and(
        eq(townSections.active, true),
        eq(townSections.provisionKind, input.provisionKind),
        sql`lower(${townSections.reference}) = lower(${input.reference.trim()})`,
        exceptId === undefined ? undefined : ne(townSections.id, exceptId),
      ),
    )
    .limit(1)
  return row !== undefined
}

function cleaned(input: TownSectionInput) {
  return {
    provisionKind: input.provisionKind,
    reference: input.reference.trim(),
    title: input.title.trim(),
  }
}

async function mayEdit(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  return (await requireCapability(db, actor.userId, 'config.edit', signal)).ok
}

export async function addTownSection(
  db: Db,
  actor: Actor,
  input: TownSectionInput,
  signal: AbortSignal,
): Promise<Result<{ sectionId: string }, SaveSectionError>> {
  if (!(await mayEdit(db, actor, signal))) return err('forbidden')
  return await transactionResult(db, async (tx: Tx) => {
    await lockSections(tx)
    if (await referenceTaken(tx, input)) return err('reference_taken')
    const values = cleaned(input)
    const [row] = await tx
      .insert(townSections)
      .values({ ...values, createdBy: actor.userId })
      .returning({ id: townSections.id })
    const sectionId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'town_section.add',
        entityType: 'town_section',
        entityId: sectionId,
        after: values,
      },
      signal,
    )
    return ok({ sectionId })
  })
}

async function lockedSection(tx: Tx, sectionId: string): Promise<TownSectionRow | null> {
  const [row] = await tx
    .select()
    .from(townSections)
    .where(eq(townSections.id, sectionId))
    .for('update')
  return row ?? null
}

export async function editTownSection(
  db: Db,
  actor: Actor,
  input: TownSectionInput & { sectionId: string },
  signal: AbortSignal,
): Promise<Result<void, SaveSectionError>> {
  if (!(await mayEdit(db, actor, signal))) return err('forbidden')
  return await transactionResult(db, async (tx: Tx) => {
    const row = await lockedSection(tx, input.sectionId)
    if (row === null) return err('not_found')
    if (!row.active) return err('retired')
    await lockSections(tx)
    if (await referenceTaken(tx, input, row.id)) return err('reference_taken')
    const values = cleaned(input)
    await tx
      .update(townSections)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(townSections.id, row.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'town_section.edit',
        entityType: 'town_section',
        entityId: row.id,
        before: { provisionKind: row.provisionKind, reference: row.reference, title: row.title },
        after: values,
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function retireTownSection(
  db: Db,
  actor: Actor,
  input: { sectionId: string },
  signal: AbortSignal,
): Promise<Result<void, SaveSectionError>> {
  if (!(await mayEdit(db, actor, signal))) return err('forbidden')
  return await transactionResult(db, async (tx: Tx) => {
    const row = await lockedSection(tx, input.sectionId)
    if (row === null) return err('not_found')
    if (!row.active) return err('retired')
    await tx
      .update(townSections)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(townSections.id, row.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'town_section.retire',
        entityType: 'town_section',
        entityId: row.id,
        before: { active: true },
        after: { active: false },
      },
      signal,
    )
    return ok(undefined)
  })
}
