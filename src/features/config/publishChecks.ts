import type { Tx } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { ConfigIssue, ConfigKind, TownRuleSettingBody } from '@/features/config/kinds'
import { type ConfigVersionRow, getPublished } from '@/features/config/store'
import { exprFieldRefs, type FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormBody } from '@/features/forms/formSchema'
import { loadPack } from '@/features/packs/loadPack'
import { checkTownValue } from '@/features/packs/overridePolicy'
import { unknownMergeFields } from '@/features/templates/mergeFields'
import type { TemplateBody } from '@/features/templates/templateSchema'

export type PublishError =
  | 'forbidden'
  | 'not_draft'
  | { invalid: ConfigIssue[] }
  | { missingClassification: true }
  | { missingBindings: string[] }
  | { unknownBindings: string[] }
  | { missingReferences: string[] }
  | { policyViolations: { ruleKey: string; error: string }[] }
  | { unknownMergeFields: string[] }
  | { unknownFieldRefs: string[] }

const NUMERIC_TYPES = new Set(['integer', 'decimal', 'money'])

function checkTownRule(body: TownRuleSettingBody, key: string): PublishError | null {
  const rule = loadPack().rules.find((r) => r.key === body.ruleKey)
  if (rule === undefined) {
    return { invalid: [{ path: 'ruleKey', message: `unknown rule ${body.ruleKey}` }] }
  }
  if (key !== body.ruleKey) {
    return { invalid: [{ path: 'ruleKey', message: 'the configuration key must be the rule key' }] }
  }
  const checked = checkTownValue(rule, {
    value: body.value,
    adoptingAuthority: body.adoptingAuthority,
    adoptedOn: body.adoptedOn,
  })
  if (checked.ok) return null
  return { policyViolations: [{ ruleKey: body.ruleKey, error: checked.error }] }
}

async function checkApplicationType(
  tx: Tx,
  body: ApplicationTypeBody,
  signal: AbortSignal,
): Promise<PublishError | null> {
  const pack = loadPack()
  const classification = pack.classifications.find((c) => c.key === body.classification)
  if (classification === undefined) return { missingClassification: true }
  const known = new Set(pack.rules.map((r) => r.key))
  const unknownBindings = body.bindings.filter((b) => !known.has(b))
  if (unknownBindings.length > 0) return { unknownBindings }
  const missingBindings = classification.mandatoryRuleKeys.filter((k) => !body.bindings.includes(k))
  if (missingBindings.length > 0) return { missingBindings }
  const form = await getPublished(tx, 'form', body.formKey, signal)
  const fee = await getPublished(tx, 'fee_schedule', body.feeScheduleKey, signal)
  const conditions = await getPublished(tx, 'condition_library', body.conditionLibraryKey, signal)
  const checklists: (ConfigVersionRow | null)[] = []
  for (const k of body.checklistKeys) {
    checklists.push(await getPublished(tx, 'inspection_checklist', k, signal))
  }
  const templates: (ConfigVersionRow | null)[] = []
  for (const k of body.templateKeys) templates.push(await getPublished(tx, 'template', k, signal))
  const missingReferences = [
    ...(form === null ? [`form:${body.formKey}`] : []),
    ...(fee === null ? [`fee_schedule:${body.feeScheduleKey}`] : []),
    ...(conditions === null ? [`condition_library:${body.conditionLibraryKey}`] : []),
    ...body.checklistKeys
      .filter((_, i) => checklists[i] === null)
      .map((k) => `inspection_checklist:${k}`),
    ...body.templateKeys.filter((_, i) => templates[i] === null).map((k) => `template:${k}`),
  ]
  if (missingReferences.length > 0) return { missingReferences }
  const formBody = form?.body as FormBody
  const numeric = new Set(
    formBody.fields.filter((f) => NUMERIC_TYPES.has(f.type)).map((f) => f.key),
  )
  const refs = (fee?.body as FeeScheduleBody).lines.flatMap((l) => exprFieldRefs(l.expr))
  const unknownFieldRefs = [...new Set(refs.filter((r) => !numeric.has(r)))]
  if (unknownFieldRefs.length > 0) return { unknownFieldRefs }
  const merge = templates.flatMap((t) => unknownMergeFields((t?.body as TemplateBody).body))
  if (merge.length > 0) return { unknownMergeFields: [...new Set(merge)] }
  return null
}

export async function runPublishChecks(
  tx: Tx,
  kind: ConfigKind,
  key: string,
  body: unknown,
  signal: AbortSignal,
): Promise<PublishError | null> {
  if (kind === 'application_type') {
    return await checkApplicationType(tx, body as ApplicationTypeBody, signal)
  }
  if (kind === 'template') {
    const unknown = unknownMergeFields((body as TemplateBody).body)
    return unknown.length > 0 ? { unknownMergeFields: unknown } : null
  }
  if (kind === 'town_rule_setting') return checkTownRule(body as TownRuleSettingBody, key)
  return null
}
