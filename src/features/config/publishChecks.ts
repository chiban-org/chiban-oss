import type { Tx } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'
import { checkBoardSettings } from '@/features/boards/boardSettingsChecks'
import type {
  ConfigIssue,
  ConfigKind,
  LocalCodeAmendmentBody,
  TownRuleSettingBody,
} from '@/features/config/kinds'
import {
  checkAmendmentPlaceholders,
  checkFormPlaceholders,
} from '@/features/config/placeholderChecks'
import { type ConfigVersionRow, getPublished } from '@/features/config/store'
import { townRuleValueIssue } from '@/features/config/townRuleBounds'
import { exprFieldRefs, type FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormBody } from '@/features/forms/formSchema'
import { type ChecklistBody, isFinalChecklist } from '@/features/inspections/checklistSchema'
import { loadPack } from '@/features/packs/loadPack'
import { checkTownValue } from '@/features/packs/overridePolicy'
import { checkTemplate, unknownTemplateFields } from '@/features/templates/templateChecks'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { checkTownProfile } from '@/features/town/profileChecks'
import type { TownProfileBody } from '@/features/town/profileSchema'
import { validateWorkflow, type WorkflowIssue } from '@/features/workflow/validateWorkflow'

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
  | { disallowedMergeFields: string[] }
  | { missingLockedBlocks: string[] }
  | { unknownBlocks: string[] }
  | { unknownFieldRefs: string[] }
  | { finalChecklistCount: number }
  | { workflowIssues: WorkflowIssue[] }

const NUMERIC_TYPES = new Set(['integer', 'decimal', 'money'])

function checkTownRule(body: TownRuleSettingBody, key: string): PublishError | null {
  const rule = loadPack().rules.find((r) => r.key === body.ruleKey)
  if (rule === undefined) {
    return { invalid: [{ path: 'ruleKey', message: `unknown rule ${body.ruleKey}` }] }
  }
  if (key !== body.ruleKey) {
    return { invalid: [{ path: 'ruleKey', message: 'the configuration key must be the rule key' }] }
  }
  const valueIssue = townRuleValueIssue(rule, body.value)
  if (valueIssue !== null) return { invalid: [{ path: 'value', message: valueIssue }] }
  const checked = checkTownValue(rule, {
    value: body.value,
    adoptingAuthority: body.adoptingAuthority,
    adoptedOn: body.adoptedOn,
  })
  if (checked.ok) return null
  return { policyViolations: [{ ruleKey: body.ruleKey, error: checked.error }] }
}

export async function checkApplicationType(
  tx: Tx,
  body: ApplicationTypeBody,
  signal: AbortSignal,
): Promise<PublishError | null> {
  const pack = loadPack()
  const classification = pack.classifications.find((c) => c.key === body.classification)
  if (classification === undefined) return { missingClassification: true }
  const workflowIssues = validateWorkflow(body.workflow, classification)
  if (workflowIssues.length > 0) return { workflowIssues }
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
  if (body.checklistKeys.length > 0) {
    const finalChecklistCount = checklists.filter((c) =>
      isFinalChecklist(c?.body as ChecklistBody),
    ).length
    if (finalChecklistCount !== 1) return { finalChecklistCount }
  }
  const formBody = form?.body as FormBody
  const numeric = new Set(
    formBody.fields.filter((f) => NUMERIC_TYPES.has(f.type)).map((f) => f.key),
  )
  const refs = (fee?.body as FeeScheduleBody).lines.flatMap((l) => exprFieldRefs(l.expr))
  const unknownFieldRefs = [...new Set(refs.filter((r) => !numeric.has(r)))]
  if (unknownFieldRefs.length > 0) return { unknownFieldRefs }
  const merge = templates.flatMap((t) => unknownTemplateFields(t?.body as TemplateBody))
  if (merge.length > 0) return { unknownMergeFields: [...new Set(merge)] }
  return null
}

function placeholderError(issues: ConfigIssue[]): PublishError | null {
  return issues.length === 0 ? null : { invalid: issues }
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
  if (kind === 'template') return checkTemplate(body as TemplateBody)
  if (kind === 'form') return placeholderError(checkFormPlaceholders(body as FormBody))
  if (kind === 'local_code_amendment') {
    return placeholderError(checkAmendmentPlaceholders(body as LocalCodeAmendmentBody))
  }
  if (kind === 'town_rule_setting') return checkTownRule(body as TownRuleSettingBody, key)
  if (kind === 'board_settings') return await checkBoardSettings(tx, body as BoardSettingsBody)
  if (kind === 'town_profile') return checkTownProfile(body as TownProfileBody)
  return null
}
