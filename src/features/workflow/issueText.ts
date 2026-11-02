import { STATE_LABELS } from '@/features/applications/states'
import type { WorkflowIssue } from '@/features/workflow/validateWorkflow'
import { words } from '@/lib/words'

function stateName(issue: WorkflowIssue): string {
  return issue.state === undefined ? 'That state' : STATE_LABELS[issue.state]
}

function stepName(issue: WorkflowIssue): string {
  return words(issue.key ?? 'step')
}

export function workflowIssueText(issue: WorkflowIssue): string {
  switch (issue.code) {
    case 'unknown_state':
      return 'A step is placed under a state that does not exist.'
    case 'terminal_state_substep':
      return `${stateName(issue)} is a final state, so it cannot have the ${stepName(issue)} step.`
    case 'duplicate_substep':
      return `${stateName(issue)} lists the ${stepName(issue)} step more than once.`
    case 'missing_required_substep':
      return `${stateName(issue)} needs a ${stepName(issue)} step for this kind of proceeding.`
    case 'direct_issue_not_allowed':
      return 'This kind of proceeding cannot be issued directly. It has to go through the board.'
  }
}
