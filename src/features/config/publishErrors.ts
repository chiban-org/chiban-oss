import type { PublishError } from '@/features/config/publishChecks'

export type FieldErrors = Record<string, string>

const POLICY_COPY: Record<string, string> = {
  fixed: 'This value is fixed by statute and cannot be changed.',
  below_minimum: 'This value is below the statutory minimum.',
  above_maximum: 'This value is above the statutory maximum.',
  outside_delegated_range: 'This value is outside the range the statute allows.',
  locally_prohibited: 'The town cannot set this value.',
}

const FORM_FIELD = '_form'

function fromIssues(issues: { path: string; message: string }[]): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of issues) {
    const first = issue.path.split('.')[0] ?? ''
    const field = first === '' ? FORM_FIELD : first
    const held = out[field]
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
    return { classification: 'Choose a classification before publishing.' }
  }
  if ('missingBindings' in error) {
    return { bindings: `Missing mandatory rules: ${error.missingBindings.join(', ')}.` }
  }
  if ('unknownBindings' in error) {
    return {
      bindings: `These rules are not in the jurisdiction pack: ${error.unknownBindings.join(', ')}.`,
    }
  }
  if ('missingReferences' in error) {
    return { references: `Publish these first: ${error.missingReferences.join(', ')}.` }
  }
  if ('unknownMergeFields' in error) {
    return { body: `Unknown merge fields: ${error.unknownMergeFields.join(', ')}.` }
  }
  if ('unknownFieldRefs' in error) {
    return {
      lines: `Fee lines use fields the form does not have: ${error.unknownFieldRefs.join(', ')}.`,
    }
  }
  return fromPolicyViolations(error.policyViolations)
}

export function fieldErrorsFor(error: PublishError): FieldErrors {
  if (error === 'forbidden') {
    return { [FORM_FIELD]: 'You do not have permission to change configuration.' }
  }
  if (error === 'not_draft') {
    return { [FORM_FIELD]: 'Only a draft can be published. Save a draft first.' }
  }
  return fromObjectError(error)
}
