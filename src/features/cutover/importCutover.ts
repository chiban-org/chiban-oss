import { inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { cutoverRows } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { importRow } from '@/features/cutover/importRow'
import { parseCutoverCsv } from '@/features/cutover/parseRows'
import { err, ok, type Result } from '@/types/result'

export interface CutoverReport {
  rows: {
    line: number
    legacyNumber: string
    outcome: 'imported' | 'already_imported' | 'error'
    errors: string[]
    applicationNumber: string | null
  }[]
  counts: { imported: number; alreadyImported: number; errors: number }
}

class DryRunRollback extends Error {
  readonly report: CutoverReport

  constructor(report: CutoverReport) {
    super('dry run')
    this.report = report
  }
}

async function runRows(
  db: Db,
  actor: Actor,
  bytes: Uint8Array,
  signal: AbortSignal,
  now: Date,
): Promise<Result<CutoverReport, 'malformed'>> {
  const parsed = parseCutoverCsv(bytes)
  if (!parsed.ok) return err('malformed')
  const known = await db
    .select({ legacyNumber: cutoverRows.legacyNumber })
    .from(cutoverRows)
    .where(
      inArray(
        cutoverRows.legacyNumber,
        parsed.value.rows.map((r) => r.legacyNumber),
      ),
    )
  const imported = new Set(known.map((k) => k.legacyNumber))
  const report: CutoverReport = { rows: [], counts: { imported: 0, alreadyImported: 0, errors: 0 } }
  for (const row of parsed.value.rows) {
    signal.throwIfAborted()
    const base = { line: row.line, legacyNumber: row.legacyNumber }
    if (imported.has(row.legacyNumber)) {
      report.rows.push({
        ...base,
        outcome: 'already_imported',
        errors: [],
        applicationNumber: null,
      })
      report.counts.alreadyImported += 1
      continue
    }
    const outcome =
      row.errors.length > 0
        ? err(row.errors)
        : await transactionResult(db, (tx) =>
            importRow(tx, actor, row, parsed.value.sourceSha256, signal, now),
          )
    if (outcome.ok) {
      imported.add(row.legacyNumber)
      report.rows.push({
        ...base,
        outcome: 'imported',
        errors: [],
        applicationNumber: outcome.value.number,
      })
      report.counts.imported += 1
    } else {
      report.rows.push({
        ...base,
        outcome: 'error',
        errors: outcome.error,
        applicationNumber: null,
      })
      report.counts.errors += 1
    }
  }
  return ok(report)
}

export async function importCutoverCsv(
  db: Db,
  actor: Actor,
  input: { bytes: Uint8Array; dryRun: boolean; now?: Date },
  signal: AbortSignal,
): Promise<Result<CutoverReport, 'forbidden' | 'malformed'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'cutover.import', signal)
  if (!allowed.ok) return err('forbidden')
  const now = input.now ?? new Date()
  if (!input.dryRun) return await runRows(db, actor, input.bytes, signal, now)
  try {
    return await db.transaction(async (outer) => {
      const result = await runRows(outer, actor, input.bytes, signal, now)
      if (!result.ok) return result
      throw new DryRunRollback(result.value)
    })
  } catch (e) {
    if (e instanceof DryRunRollback) return ok(e.report)
    throw e
  }
}
