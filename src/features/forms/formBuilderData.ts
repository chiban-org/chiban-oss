import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'
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

export async function loadFormBuilderData(
  db: DbOrTx,
  formKey: string,
  signal: AbortSignal,
): Promise<FormBuilderData> {
  const types = await typesUsingForm(db, formKey, signal)
  const fees: { key: string; body: FeeScheduleBody }[] = []
  for (const key of new Set(types.map((t) => t.feeScheduleKey))) {
    const row = await getPublished(db, 'fee_schedule', key, signal)
    if (row !== null) fees.push({ key, body: row.body as FeeScheduleBody })
  }
  return {
    frozenKeys: await publishedKeys(db, formKey, signal),
    externalUses: externalUses(formKey, types, fees),
  }
}
