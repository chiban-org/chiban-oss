import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type ExportTargetRow, exportsTable, exportTargets } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { canonicalJson } from '@/features/export/canonical'
import {
  dayOfMonthSchema,
  SETTINGS_SCHEMAS,
  targetNameSchema,
} from '@/features/export/targets/settings'
import { encryptSecret } from '@/server/secrets'
import { err, ok, type Result } from '@/types/result'

export { buildTarget } from '@/features/export/targets/buildTarget'

export type ExportTargetView = Omit<ExportTargetRow, 'credentialsEnc'>

export interface TargetInput {
  id?: string
  kind: ExportTargetRow['kind']
  name: string
  dayOfMonth: number
  settings: unknown
  credentials: unknown
}

type Guarded = 'forbidden'

async function allowed(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return (await requireCapability(db, actor.userId, 'config.edit', signal)).ok
}

function view(row: ExportTargetRow): ExportTargetView {
  const { credentialsEnc: _omitted, ...rest } = row
  return rest
}

export async function listTargets(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<ExportTargetView[], Guarded>> {
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  const rows = await db.select().from(exportTargets).orderBy(asc(exportTargets.createdAt))
  return ok(rows.map(view))
}

function validated(input: TargetInput) {
  const schemas = SETTINGS_SCHEMAS[input.kind]
  const name = targetNameSchema.safeParse(input.name)
  const day = dayOfMonthSchema.safeParse(input.dayOfMonth)
  const settings = schemas.settings.safeParse(input.settings)
  if (!name.success || !day.success || !settings.success) return null
  if (schemas.credentials === null) {
    return { name: name.data, day: day.data, settings: settings.data, credentials: null }
  }
  if (input.credentials === null) {
    return { name: name.data, day: day.data, settings: settings.data, credentials: 'keep' as const }
  }
  const credentials = schemas.credentials.safeParse(input.credentials)
  if (!credentials.success) return null
  return { name: name.data, day: day.data, settings: settings.data, credentials: credentials.data }
}

export async function saveTarget(
  db: Db,
  actor: Actor,
  input: TargetInput,
  signal: AbortSignal,
): Promise<Result<{ id: string }, Guarded | 'invalid_input' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  const checked = validated(input)
  if (checked === null) return err('invalid_input')
  return await transactionResult(db, async (tx) => {
    const [existing] =
      input.id === undefined
        ? []
        : await tx.select().from(exportTargets).where(eq(exportTargets.id, input.id)).limit(1)
    if (input.id !== undefined && (existing === undefined || existing.kind !== input.kind)) {
      return err('not_found' as const)
    }
    if (checked.credentials === 'keep' && existing?.credentialsEnc == null) {
      return err('invalid_input' as const)
    }
    const credentialsEnc =
      checked.credentials === 'keep'
        ? (existing?.credentialsEnc ?? null)
        : checked.credentials === null
          ? null
          : encryptSecret(JSON.stringify(checked.credentials))
    const values = {
      kind: input.kind,
      name: checked.name,
      dayOfMonth: checked.day,
      settings: checked.settings,
      credentialsEnc,
    }
    const [row] =
      existing === undefined
        ? await tx.insert(exportTargets).values(values).returning({ id: exportTargets.id })
        : await tx
            .update(exportTargets)
            .set(values)
            .where(eq(exportTargets.id, existing.id))
            .returning({ id: exportTargets.id })
    const id = row?.id ?? ''
    if (
      existing !== undefined &&
      canonicalJson(existing.settings) !== canonicalJson(checked.settings)
    ) {
      await tx
        .update(exportsTable)
        .set({ status: 'expired' })
        .where(
          and(
            eq(exportsTable.targetId, existing.id),
            eq(exportsTable.kind, 'incremental'),
            eq(exportsTable.status, 'ready'),
          ),
        )
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: existing === undefined ? 'export_target.add' : 'export_target.edit',
        entityType: 'export_target',
        entityId: id,
        after: { kind: input.kind, name: checked.name, dayOfMonth: checked.day },
      },
      signal,
    )
    return ok({ id })
  })
}

export async function setTargetActive(
  db: Db,
  actor: Actor,
  id: string,
  active: boolean,
  signal: AbortSignal,
): Promise<Result<void, Guarded | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .update(exportTargets)
      .set({ isActive: active, ...(active ? {} : { runRequestedAt: null }) })
      .where(eq(exportTargets.id, id))
      .returning({ id: exportTargets.id })
    if (row === undefined) return err('not_found' as const)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: active ? 'export_target.activate' : 'export_target.deactivate',
        entityType: 'export_target',
        entityId: id,
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function requestRunNow(
  db: Db,
  actor: Actor,
  id: string,
  signal: AbortSignal,
): Promise<Result<void, Guarded | 'not_found' | 'not_active'>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  const [row] = await db.select().from(exportTargets).where(eq(exportTargets.id, id)).limit(1)
  if (row === undefined) return err('not_found')
  if (!row.isActive) return err('not_active')
  await db
    .update(exportTargets)
    .set({ runRequestedAt: new Date() })
    .where(and(eq(exportTargets.id, id), eq(exportTargets.isActive, true)))
  return ok(undefined)
}
