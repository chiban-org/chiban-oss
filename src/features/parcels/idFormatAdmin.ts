import { asc, eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { aliasOverrides, parcelAliases, parcelIdFormats } from '@/db/schema'
import { migrationBatches } from '@/db/schema/migration'
import { parcelRecordLinks } from '@/db/schema/parcelRecordLinks'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

export type IdFormatKind = 'digits' | 'free_text'

export interface IdFormatInput {
  label: string
  kind: IdFormatKind
  width: number | null
}

export type IdFormatError =
  | 'forbidden'
  | 'not_found'
  | 'key_taken'
  | 'in_use'
  | 'is_display'
  | { narrows: number }

export interface IdFormatRow {
  key: string
  label: string
  kind: IdFormatKind
  width: number | null
  isDisplay: boolean
  aliasCount: number
  inUse: boolean
}

type FormatRow = typeof parcelIdFormats.$inferSelect

async function mayEdit(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  return (await requireCapability(db, actor.userId, 'config.edit', signal)).ok
}

function shapeOf(row: FormatRow) {
  return { label: row.label, kind: row.kind, width: row.width }
}

function cleaned(input: IdFormatInput) {
  const digits = input.kind === 'digits'
  return { label: input.label.trim(), kind: input.kind, width: digits ? input.width : null }
}

async function usage(tx: Db | Tx, key: string): Promise<{ aliases: number; other: number }> {
  const result = await tx.execute<{ aliases: number; other: number }>(sql`
    select
      (select count(*) from ${parcelAliases} where ${parcelAliases.format} = ${key})::int as aliases,
      ((select count(*) from ${aliasOverrides} where ${aliasOverrides.format} = ${key})
        + (select count(*) from ${migrationBatches} where ${migrationBatches.idFormat} = ${key})
        + (select count(*) from ${parcelRecordLinks} where ${parcelRecordLinks.rawRefFormat} = ${key}))::int as other`)
  return result.rows[0] ?? { aliases: 0, other: 0 }
}

async function misfits(tx: Tx, key: string, next: ReturnType<typeof cleaned>): Promise<number> {
  if (next.kind !== 'digits') return 0
  const widthTest =
    next.width === null ? sql`false` : sql`length(${parcelAliases.value}) <> ${next.width}`
  const result = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from ${parcelAliases}
    where ${parcelAliases.format} = ${key}
      and (${parcelAliases.value} !~ '^[0-9]+$' or ${widthTest})`)
  return result.rows[0]?.n ?? 0
}

export async function listIdFormats(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<IdFormatRow[], 'forbidden'>> {
  if (!(await mayEdit(db, actor, signal))) return err('forbidden')
  const formats = await db.select().from(parcelIdFormats).orderBy(asc(parcelIdFormats.label))
  const rows: IdFormatRow[] = []
  for (const f of formats) {
    signal.throwIfAborted()
    const used = await usage(db, f.key)
    rows.push({
      key: f.key,
      label: f.label,
      kind: f.kind,
      width: f.width,
      isDisplay: f.isDisplay,
      aliasCount: used.aliases,
      inUse: used.aliases + used.other > 0,
    })
  }
  return ok(rows)
}

async function lockedFormat(tx: Tx, key: string): Promise<FormatRow | null> {
  const [row] = await tx
    .select()
    .from(parcelIdFormats)
    .where(eq(parcelIdFormats.key, key))
    .for('update')
  return row ?? null
}

interface AuditInput {
  actor: Actor
  action: string
  key: string
  before?: object
  after?: object
  signal: AbortSignal
}

async function audit(tx: Tx, { actor, action, key, before, after, signal }: AuditInput) {
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: `parcel_id_format.${action}`,
      entityType: 'parcel_id_format',
      entityId: key,
      before,
      after,
    },
    signal,
  )
}

export async function addIdFormat(
  db: Db,
  actor: Actor,
  input: IdFormatInput & { key: string },
  signal: AbortSignal,
): Promise<Result<void, IdFormatError>> {
  if (!(await mayEdit(db, actor, signal))) return err('forbidden')
  return await transactionResult<void, IdFormatError>(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('parcel_id_formats'))`)
    if ((await lockedFormat(tx, input.key)) !== null) return err('key_taken')
    const [existing] = await tx.select({ key: parcelIdFormats.key }).from(parcelIdFormats).limit(1)
    const values = { key: input.key, ...cleaned(input), isDisplay: existing === undefined }
    await tx.insert(parcelIdFormats).values(values)
    await audit(tx, { actor, action: 'add', key: input.key, after: values, signal })
    return ok(undefined)
  })
}

export async function editIdFormat(
  db: Db,
  actor: Actor,
  input: IdFormatInput & { key: string },
  signal: AbortSignal,
): Promise<Result<void, IdFormatError>> {
  if (!(await mayEdit(db, actor, signal))) return err('forbidden')
  return await transactionResult<void, IdFormatError>(db, async (tx) => {
    const row = await lockedFormat(tx, input.key)
    if (row === null) return err('not_found')
    const values = cleaned(input)
    const narrows = await misfits(tx, row.key, values)
    if (narrows > 0) return err({ narrows })
    await tx.update(parcelIdFormats).set(values).where(eq(parcelIdFormats.key, row.key))
    await audit(tx, {
      actor,
      action: 'edit',
      key: row.key,
      before: shapeOf(row),
      after: values,
      signal,
    })
    return ok(undefined)
  })
}

export async function chooseDisplayFormat(
  db: Db,
  actor: Actor,
  input: { key: string },
  signal: AbortSignal,
): Promise<Result<void, IdFormatError>> {
  if (!(await mayEdit(db, actor, signal))) return err('forbidden')
  return await transactionResult<void, IdFormatError>(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('parcel_id_formats'))`)
    const row = await lockedFormat(tx, input.key)
    if (row === null) return err('not_found')
    if (row.isDisplay) return ok(undefined)
    const [previous] = await tx
      .update(parcelIdFormats)
      .set({ isDisplay: false })
      .where(eq(parcelIdFormats.isDisplay, true))
      .returning({ key: parcelIdFormats.key })
    await tx
      .update(parcelIdFormats)
      .set({ isDisplay: true })
      .where(eq(parcelIdFormats.key, row.key))
    await audit(tx, {
      actor,
      action: 'display',
      key: row.key,
      before: { displayKey: previous?.key ?? null },
      after: { displayKey: row.key },
      signal,
    })
    return ok(undefined)
  })
}

export async function deleteIdFormat(
  db: Db,
  actor: Actor,
  input: { key: string },
  signal: AbortSignal,
): Promise<Result<void, IdFormatError>> {
  if (!(await mayEdit(db, actor, signal))) return err('forbidden')
  return await transactionResult<void, IdFormatError>(db, async (tx) => {
    const row = await lockedFormat(tx, input.key)
    if (row === null) return err('not_found')
    if (row.isDisplay) return err('is_display')
    const used = await usage(tx, row.key)
    if (used.aliases + used.other > 0) return err('in_use')
    await tx.delete(parcelIdFormats).where(eq(parcelIdFormats.key, row.key))
    await audit(tx, { actor, action: 'delete', key: row.key, before: shapeOf(row), signal })
    return ok(undefined)
  })
}
