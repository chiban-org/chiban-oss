import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { historicalRecords, parcelIdFormats } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { composeCamaId } from '@/features/cama/readCamaCsv'
import { linkRecordByRawRef } from '@/features/parcels/recordLinks'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { err, ok, type Result } from '@/types/result'
import { type SpreadsheetMapping, spreadsheetMappingSchema } from './mapping'
import { parseHistoricalDate } from './parseDate'
import { type Cell, type ReadError, readSheet, type SheetRow } from './readSheet'

export const HISTORICAL_RECORD_KIND = 'historical_record'

export interface ImportSheetInput {
  path: string
  mapping: SpreadsheetMapping
  dryRun: boolean
}

export interface ImportSheetReport {
  rows: number
  imported: number
  alreadyImported: number
  unresolvedParcel: number
  errors: { row: number; detail: string }[]
}

export type ImportSheetError = 'forbidden' | 'invalid_mapping' | 'unknown_format' | ReadError

const preparedRowSchema = z.object({
  recordType: z.string().min(1),
  number: z.string().min(1).nullable(),
  recordedOn: z.string().nullable(),
  description: z.string().min(1).nullable(),
  parcelRef: z.string().min(1),
  values: z.record(z.string(), z.string()),
})

type PreparedRow = z.infer<typeof preparedRowSchema>

function cellText(cell: Cell | undefined): string | null {
  if (cell === undefined) return null
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  return String(cell)
}

function readDate(
  line: SheetRow,
  date: NonNullable<SpreadsheetMapping['date']>,
): Result<string | null, string> {
  const cell = line.cells.get(date.column)
  if (cell === undefined) return ok(null)
  const parsed = parseHistoricalDate(cell, date.formats, date.twoDigitYearPivot)
  return parsed.ok
    ? ok(parsed.value)
    : err(`The date "${cellText(cell)}" in column ${date.column} could not be read`)
}

function pick(text: ReadonlyMap<string, string>, columns: string[]): [string, string][] {
  return columns.flatMap((c): [string, string][] => {
    const value = text.get(c)
    return value === undefined ? [] : [[c, value]]
  })
}

function prepareRow(line: SheetRow, mapping: SpreadsheetMapping): Result<PreparedRow, string> {
  const text = new Map<string, string>()
  for (const [name, cell] of line.cells) text.set(name, cellText(cell) ?? '')
  const parcelRef = composeCamaId(text, mapping.parcel.parts)
  if (parcelRef === null) return err('The parcel columns do not make a parcel id')
  const date = mapping.date === undefined ? ok(null) : readDate(line, mapping.date)
  if (!date.ok) return date
  const type = mapping.recordType
  const description = pick(text, mapping.description ?? []).map(([, v]) => v)
  const prepared = preparedRowSchema.safeParse({
    recordType: 'literal' in type ? type.literal : text.get(type.column),
    number: mapping.number === undefined ? null : (text.get(mapping.number) ?? null),
    recordedOn: date.value,
    description: description.length === 0 ? null : description.join(', '),
    parcelRef,
    values: Object.fromEntries(pick(text, mapping.keep)),
  })
  return prepared.success ? ok(prepared.data) : err('The row has no record type')
}

type Outcome = 'imported' | 'already' | 'imported_unresolved'

interface RowSource {
  file: string
  sha256: string
  sheet: string
  row: number
}

async function isStored(db: Db, source: RowSource): Promise<boolean> {
  const found = await db
    .select({ id: historicalRecords.id })
    .from(historicalRecords)
    .where(
      and(
        eq(historicalRecords.sourceSha256, source.sha256),
        eq(historicalRecords.sourceSheet, source.sheet),
        eq(historicalRecords.sourceRow, source.row),
      ),
    )
  return found.length > 0
}

interface StoreInput {
  actor: Actor
  source: RowSource
  prepared: PreparedRow
  format: string
}

async function store(db: Db, input: StoreInput, signal: AbortSignal): Promise<Outcome> {
  const { actor, source, prepared, format } = input
  return await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(historicalRecords)
      .values({
        recordType: prepared.recordType,
        number: prepared.number,
        recordedOn: prepared.recordedOn,
        description: prepared.description,
        values: prepared.values,
        sourceFile: source.file,
        sourceSha256: source.sha256,
        sourceSheet: source.sheet,
        sourceRow: source.row,
        importedBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ id: historicalRecords.id })
    if (inserted === undefined) return 'already'
    const link = await linkRecordByRawRef(
      tx,
      {
        recordKind: HISTORICAL_RECORD_KIND,
        recordId: inserted.id,
        format,
        value: prepared.parcelRef,
      },
      signal,
    )
    return link.status === 'linked' ? 'imported' : 'imported_unresolved'
  })
}

async function preview(
  db: Db,
  input: Omit<StoreInput, 'actor'>,
  signal: AbortSignal,
): Promise<Outcome> {
  const { source, prepared, format } = input
  if (await isStored(db, source)) return 'already'
  const resolved = await resolveParcelId(db, { format, value: prepared.parcelRef }, signal)
  return resolved.ok ? 'imported' : 'imported_unresolved'
}

function tally(report: ImportSheetReport, outcome: Outcome): void {
  if (outcome === 'already') report.alreadyImported += 1
  else report.imported += 1
  if (outcome === 'imported_unresolved') report.unresolvedParcel += 1
}

export async function importSheet(
  db: Db,
  actor: Actor,
  input: ImportSheetInput,
  signal: AbortSignal,
): Promise<Result<ImportSheetReport, ImportSheetError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsedMapping = spreadsheetMappingSchema.safeParse(input.mapping)
  if (!parsedMapping.success) return err('invalid_mapping')
  const mapping = parsedMapping.data
  const [knownFormat] = await db
    .select({ key: parcelIdFormats.key })
    .from(parcelIdFormats)
    .where(eq(parcelIdFormats.key, mapping.parcel.format))
  if (knownFormat === undefined) return err('unknown_format')
  const sheet = await readSheet(input.path, mapping, signal)
  if (!sheet.ok) return sheet
  const file = input.path.split(/[\\/]/).pop() ?? input.path
  const report: ImportSheetReport = {
    rows: sheet.value.rows.length,
    imported: 0,
    alreadyImported: 0,
    unresolvedParcel: 0,
    errors: [],
  }
  for (const line of sheet.value.rows) {
    signal.throwIfAborted()
    const prepared = prepareRow(line, mapping)
    if (!prepared.ok) {
      report.errors.push({ row: line.row, detail: prepared.error })
      continue
    }
    const source = { file, sha256: sheet.value.sha256, sheet: sheet.value.sheet, row: line.row }
    const format = mapping.parcel.format
    tally(
      report,
      input.dryRun
        ? await preview(db, { source, prepared: prepared.value, format }, signal)
        : await store(db, { actor, source, prepared: prepared.value, format }, signal),
    )
  }
  if (!input.dryRun) {
    await writeAudit(
      db,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'historical.spreadsheet_import',
        entityType: 'historical_spreadsheet',
        entityId: sheet.value.sha256,
        after: { ...report, file, sheet: sheet.value.sheet },
      },
      signal,
    )
  }
  return ok(report)
}
