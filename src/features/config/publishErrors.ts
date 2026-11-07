import type { PublishError } from '@/features/config/publishChecks'
import { loadPack } from '@/features/packs/loadPack'
import { lockedSource } from '@/features/templates/doc/lockedSources'
import { mergeFieldLabel } from '@/features/templates/mergeFieldLabels'
import { workflowIssueText } from '@/features/workflow/issueText'
import { words } from '@/lib/words'

export type FieldErrors = Record<string, string>

const POLICY_COPY: Record<string, string> = {
  fixed: 'This value is fixed by statute and cannot be changed.',
  below_minimum: 'This value is below the statutory minimum.',
  above_maximum: 'This value is above the statutory maximum.',
  outside_delegated_range: 'This value is outside the range the statute allows.',
  locally_prohibited: 'The town cannot set this value.',
}

const FORM_FIELD = '_form'

const REFERENCE_NAMES: ReadonlyMap<string, string> = new Map([
  ['form', 'the form'],
  ['fee_schedule', 'the fee schedule'],
  ['condition_library', 'the conditions'],
  ['inspection_checklist', 'the checklist'],
  ['template', 'the template'],
])

function referenceText(reference: string): string {
  const [kind = '', ...rest] = reference.split(':')
  return `${REFERENCE_NAMES.get(kind) ?? kind} ${rest.join(':')}`
}

function ruleLabel(key: string): string {
  return loadPack().rules.find((r) => r.key === key)?.label ?? key
}

function fieldNames(names: string[]): string {
  return names.map(mergeFieldLabel).join(', ')
}

function lockedNames(names: string[]): string {
  return names.map((n) => lockedSource(n)?.label ?? n).join(', ')
}

function fromIssues(issues: { path: string; message: string }[]): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of issues) {
    const first = issue.path.split('.')[0] ?? ''
    const field = first === '' ? FORM_FIELD : first
    const held = out[field]
    if (held?.includes(issue.message) === true) continue
    out[field] = held === undefined ? issue.message : `${held} ${issue.message}`
  }
  return out
}

function fromPolicyViolations(violations: { ruleKey: string; error: string }[]): FieldErrors {
  const out: FieldErrors = {}
  for (const v of violations) {
    if (v.error === 'adoption_record_missing') {
      out.adoption = 'Enter who adopted this value and the date they adopted it.'
    } else {
      out.value = POLICY_COPY[v.error] ?? 'This value is not allowed.'
    }
  }
  return out
}

type ObjectError = Exclude<PublishError, string>

function fromObjectError(error: ObjectError): FieldErrors {
  if ('invalid' in error) return fromIssues(error.invalid)
  if ('missingClassification' in error) {
    return { classification: 'Choose the kind of proceeding before publishing.' }
  }
  if ('missingBindings' in error) {
    return {
      bindings: `Turn on the rules this kind of proceeding requires: ${error.missingBindings.map(ruleLabel).join(', ')}.`,
    }
  }
  if ('unknownBindings' in error) {
    return {
      bindings: `These rules no longer exist in state law and need to be turned off: ${error.unknownBindings.join(', ')}.`,
    }
  }
  if ('missingReferences' in error) {
    return {
      references: `Pick an item that is in use, or put these into use first: ${error.missingReferences.map(referenceText).join(', ')}.`,
    }
  }
  if ('unknownMergeFields' in error) {
    return { body: `Unknown merge fields: ${error.unknownMergeFields.join(', ')}.` }
  }
  if ('disallowedMergeFields' in error) {
    return {
      body: `This kind of document cannot use these merge fields: ${fieldNames(error.disallowedMergeFields)}.`,
    }
  }
  if ('missingLockedBlocks' in error) {
    return {
      body: `Put back the blocks state law requires: ${lockedNames(error.missingLockedBlocks)}.`,
    }
  }
  if ('unknownBlocks' in error) {
    return {
      body: `These blocks do not belong in this kind of document: ${lockedNames(error.unknownBlocks)}.`,
    }
  }
  if ('finalChecklistCount' in error) {
    return {
      checklists: `Tick exactly one final inspection. ${error.finalChecklistCount === 0 ? 'None is ticked now.' : `${String(error.finalChecklistCount)} are ticked now.`}`,
    }
  }
  if ('unknownFieldRefs' in error) {
    return {
      lines: `The fee schedule counts answers this type's form does not ask as numbers: ${error.unknownFieldRefs.map((f) => words(f)).join(', ')}. Change the fee or the form.`,
    }
  }
  if ('workflowIssues' in error) {
    return { workflow: error.workflowIssues.map(workflowIssueText).join(' ') }
  }
  return fromPolicyViolations(error.policyViolations)
}

export function fieldErrorsFor(error: PublishError): FieldErrors {
  if (error === 'forbidden') {
    return { [FORM_FIELD]: 'You do not have permission to change configuration.' }
  }
  if (error === 'not_draft') {
    return { [FORM_FIELD]: 'Only a draft can be put into use. Save a draft first.' }
  }
  return fromObjectError(error)
}
