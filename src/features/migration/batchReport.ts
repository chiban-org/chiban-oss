import { and, count, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { migrationItems } from '@/db/schema'
import type { MigrationReport } from '@/features/migration/types'

export async function computeReport(db: DbOrTx, batchId: string): Promise<MigrationReport> {
  const rows = await db
    .select({
      outcome: migrationItems.outcome,
      exceptReason: migrationItems.exceptReason,
      ocrStatus: migrationItems.ocrStatus,
      parcelLink: migrationItems.parcelLink,
      n: count(),
    })
    .from(migrationItems)
    .where(eq(migrationItems.batchId, batchId))
    .groupBy(
      migrationItems.outcome,
      migrationItems.exceptReason,
      migrationItems.ocrStatus,
      migrationItems.parcelLink,
    )
  const report: MigrationReport = {
    source: 0,
    imported: 0,
    duplicateLinked: 0,
    excepted: 0,
    skipped: 0,
    ocrFailed: 0,
    unresolvedParcel: 0,
    exceptionsByReason: {},
  }
  for (const row of rows) {
    report.source += row.n
    if (row.outcome === 'imported') {
      report.imported += row.n
      if (row.ocrStatus === 'failed') report.ocrFailed += row.n
      if (row.parcelLink === 'unresolved') report.unresolvedParcel += row.n
    }
    if (row.outcome === 'duplicate_linked') report.duplicateLinked += row.n
    if (row.outcome === 'skipped') report.skipped += row.n
    if (row.outcome === 'excepted') {
      report.excepted += row.n
      const reason = row.exceptReason ?? 'unknown'
      report.exceptionsByReason[reason] = (report.exceptionsByReason[reason] ?? 0) + row.n
    }
  }
  return report
}

export async function listExceptionItems(db: DbOrTx, batchId: string) {
  return await db
    .select({
      id: migrationItems.id,
      sourcePath: migrationItems.sourcePath,
      outcome: migrationItems.outcome,
      exceptReason: migrationItems.exceptReason,
      ocrStatus: migrationItems.ocrStatus,
      ocrReason: migrationItems.ocrReason,
      parcelLink: migrationItems.parcelLink,
    })
    .from(migrationItems)
    .where(
      and(
        eq(migrationItems.batchId, batchId),
        sql`(${migrationItems.outcome} = 'excepted' or ${migrationItems.ocrStatus} = 'failed' or ${migrationItems.parcelLink} = 'unresolved')`,
      ),
    )
    .orderBy(migrationItems.sourcePath)
}

export { inArray, isNotNull }
