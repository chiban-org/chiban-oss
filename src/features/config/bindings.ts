import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { type LocalCodeAmendmentBody, LocalCodeAmendmentBodySchema } from '@/features/config/kinds'
import { type ConfigVersionRow, getPublished } from '@/features/config/store'
import type { Pack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface ConfigPins {
  applicationType: string
  form: string
  feeSchedule: string
  conditionLibrary: string
  checklists: string[]
  templates: string[]
}

export function effectiveBindings(appType: ApplicationTypeBody, pack: Pack): string[] {
  const mandatory =
    pack.classifications.find((c) => c.key === appType.classification)?.mandatoryRuleKeys ?? []
  return [...new Set([...mandatory, ...appType.bindings])]
}

export async function pinCurrent(
  db: DbOrTx,
  applicationTypeKey: string,
  signal: AbortSignal,
): Promise<Result<ConfigPins, 'not_published'>> {
  const type = await getPublished(db, 'application_type', applicationTypeKey, signal)
  if (type === null) return err('not_published')
  const body = type.body as ApplicationTypeBody
  const form = await getPublished(db, 'form', body.formKey, signal)
  const fee = await getPublished(db, 'fee_schedule', body.feeScheduleKey, signal)
  const conditions = await getPublished(db, 'condition_library', body.conditionLibraryKey, signal)
  const checklists: (ConfigVersionRow | null)[] = []
  for (const k of body.checklistKeys) {
    checklists.push(await getPublished(db, 'inspection_checklist', k, signal))
  }
  const templates: (ConfigVersionRow | null)[] = []
  for (const k of body.templateKeys) templates.push(await getPublished(db, 'template', k, signal))
  if (form === null || fee === null || conditions === null) return err('not_published')
  if (checklists.includes(null) || templates.includes(null)) return err('not_published')
  return ok({
    applicationType: type.id,
    form: form.id,
    feeSchedule: fee.id,
    conditionLibrary: conditions.id,
    checklists: checklists.flatMap((c) => (c === null ? [] : [c.id])),
    templates: templates.flatMap((t) => (t === null ? [] : [t.id])),
  })
}

export async function amendmentsInForce(
  db: DbOrTx,
  asOf: CivilDate,
  signal: AbortSignal,
): Promise<(LocalCodeAmendmentBody & { key: string })[]> {
  signal.throwIfAborted()
  const rows = await db
    .select()
    .from(configVersions)
    .where(
      and(eq(configVersions.kind, 'local_code_amendment'), eq(configVersions.status, 'published')),
    )
  return rows.flatMap((r) => {
    const parsed = LocalCodeAmendmentBodySchema.safeParse(r.body)
    if (!parsed.success) return []
    const confirmed = parsed.data.reviewBoardConfirmedOn
    return confirmed !== null && confirmed <= asOf ? [{ ...parsed.data, key: r.key }] : []
  })
}
