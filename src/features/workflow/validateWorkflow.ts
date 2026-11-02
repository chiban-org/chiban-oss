import type { ProceedingClassification } from '@packs/nh/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { CORE_STATES, type CoreState, TERMINAL_STATES } from '@/features/applications/states'

export interface WorkflowIssue {
  code:
    | 'unknown_state'
    | 'terminal_state_substep'
    | 'duplicate_substep'
    | 'missing_required_substep'
    | 'direct_issue_not_allowed'
  state?: CoreState
  key?: string
}

export function validateWorkflow(
  workflow: ApplicationTypeBody['workflow'],
  classification: Pick<ProceedingClassification, 'requiredSubsteps' | 'directIssueAllowed'>,
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []
  const seen = new Set<string>()
  for (const { state, key } of workflow.substeps) {
    if (!(CORE_STATES as readonly string[]).includes(state)) {
      issues.push({ code: 'unknown_state', state, key })
      continue
    }
    if (TERMINAL_STATES.includes(state)) issues.push({ code: 'terminal_state_substep', state, key })
    const id = `${state}:${key}`
    if (seen.has(id)) issues.push({ code: 'duplicate_substep', state, key })
    seen.add(id)
  }
  for (const { state, key } of classification.requiredSubsteps) {
    if (!seen.has(`${state}:${key}`)) issues.push({ code: 'missing_required_substep', state, key })
  }
  if (workflow.allowsDirectIssue && !classification.directIssueAllowed) {
    issues.push({ code: 'direct_issue_not_allowed' })
  }
  return issues
}
