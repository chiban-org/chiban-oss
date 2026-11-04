import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import { externalUses, type FormBuilderData } from '@/features/forms/formReferences'
import type { FormBody } from '@/features/forms/formSchema'

async function publishedKeys(db: DbOrTx, formKey: string, signal: AbortSignal): Promise<string[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({ body: configVersions.body })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.kind, 'form'),
        eq(configVersions.key, formKey),
        inArray(configVersions.status, ['published', 'superseded']),
      ),
    )
  const keys = rows.flatMap((r) => (r.body as FormBody).fields.map((f) => f.key))
  return [...new Set(keys)].sort()
}

async function typesUsingForm(
  db: DbOrTx,
  formKey: string,
  signal: AbortSignal,
): Promise<ApplicationTypeBody[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({ body: configVersions.body })
    .from(configVersions)
    .where(and(eq(configVersions.kind, 'application_type'), eq(configVersions.status, 'published')))
  return rows.map((r) => r.body as ApplicationTypeBody).filter((b) => b.formKey === formKey)
}

async function feeSchedules(
  db: DbOrTx,
  keys: string[],
  signal: AbortSignal,
): Promise<{ key: string; body: FeeScheduleBody }[]> {
  signal.throwIfAborted()
  if (keys.length === 0) return []
  const rows = await db
    .select({ key: configVersions.key, body: configVersions.body })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.kind, 'fee_schedule'),
        eq(configVersions.status, 'published'),
        inArray(configVersions.key, keys),
      ),
    )
  return rows.map((r) => ({ key: r.key, body: r.body as FeeScheduleBody }))
}

export async function loadFormBuilderData(
  db: DbOrTx,
  formKey: string,
  signal: AbortSignal,
): Promise<FormBuilderData> {
  const [frozenKeys, types] = await Promise.all([
    publishedKeys(db, formKey, signal),
    typesUsingForm(db, formKey, signal),
  ])
  const fees = await feeSchedules(db, [...new Set(types.map((t) => t.feeScheduleKey))], signal)
  return { frozenKeys, externalUses: externalUses(formKey, types, fees) }
}
