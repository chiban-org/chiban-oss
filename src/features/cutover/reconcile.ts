import { createHash } from 'node:crypto'
import { parse } from 'csv-parse/sync'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { cutoverReconciliations, cutoverRows } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

export interface ReconciliationReport {
  inListAndImported: string[]
  inListNotImported: string[]
  importedNotInList: string[]
  documentCounts: Record<string, number>
}

function legacyNumbersOf(bytes: Uint8Array): string[] | null {
  try {
    const records = parse(Buffer.from(bytes), {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[]
    if (records.length === 0 || records[0] === undefined || !('legacy_number' in records[0]))
      return null
    return [...new Set(records.map((r) => r.legacy_number ?? '').filter((n) => n !== ''))]
  } catch {
    return null
  }
}

export async function reconcileCutover(
  db: Db,
  actor: Actor,
  input: { listBytes: Uint8Array },
  signal: AbortSignal,
): Promise<Result<{ id: string; report: ReconciliationReport }, 'forbidden' | 'malformed'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'cutover.import', signal)
  if (!allowed.ok) return err('forbidden')
  const listed = legacyNumbersOf(input.listBytes)
  if (listed === null) return err('malformed')
  const imported = await db.select().from(cutoverRows)
  const importedNumbers = new Set(imported.map((r) => r.legacyNumber))
  const listedSet = new Set(listed)
  const counts = await db.execute<{ legacy_number: string; n: number }>(sql`
    select c.legacy_number, count(d.id)::int as n from cutover_rows c
    left join documents d on d.record_kind = 'application' and d.record_id = c.application_id
    group by c.legacy_number`)
  const report: ReconciliationReport = {
    inListAndImported: listed.filter((n) => importedNumbers.has(n)).sort(),
    inListNotImported: listed.filter((n) => !importedNumbers.has(n)).sort(),
    importedNotInList: [...importedNumbers].filter((n) => !listedSet.has(n)).sort(),
    documentCounts: Object.fromEntries(counts.rows.map((r) => [r.legacy_number, r.n])),
  }
  const [saved] = await db
    .insert(cutoverReconciliations)
    .values({
      listSha256: createHash('sha256').update(input.listBytes).digest('hex'),
      report,
      createdBy: actor.userId,
    })
    .returning({ id: cutoverReconciliations.id })
  return ok({ id: saved?.id ?? '', report })
}

export async function signOffReconciliation(
  db: Db,
  actor: Actor,
  reconciliationId: string,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!actor.roles.includes('admin')) return err('forbidden')
  const updated = await db
    .update(cutoverReconciliations)
    .set({ signedOffBy: actor.userId, signedOffAt: new Date() })
    .where(eq(cutoverReconciliations.id, reconciliationId))
    .returning({ id: cutoverReconciliations.id })
  if (updated.length === 0) return err('not_found')
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'cutover.reconciliation_signed_off',
      entityType: 'cutover_reconciliation',
      entityId: reconciliationId,
    },
    signal,
  )
  return ok(undefined)
}
