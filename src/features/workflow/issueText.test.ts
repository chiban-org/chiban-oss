import { describe, expect, it } from 'vitest'
import { workflowIssueText } from '@/features/workflow/issueText'

describe('workflowIssueText', () => {
  it('names the missing step in words, never by key', () => {
    expect(
      workflowIssueText({
        code: 'missing_required_substep',
        state: 'under_review',
        key: 'hearing',
      }),
    ).toBe('Under review needs a Hearing step for this kind of proceeding.')
  })

  it('explains direct issue for a board proceeding', () => {
    expect(workflowIssueText({ code: 'direct_issue_not_allowed' })).toBe(
      'This kind of proceeding cannot be issued directly. It has to go through the board.',
    )
  })

  it('explains a step on a final state', () => {
    expect(
      workflowIssueText({ code: 'terminal_state_substep', state: 'closed', key: 'archive' }),
    ).toBe('Closed is a final state, so it cannot have the Archive step.')
  })

  it('explains a repeated step', () => {
    expect(
      workflowIssueText({ code: 'duplicate_substep', state: 'submitted', key: 'intake' }),
    ).toBe('Submitted lists the Intake step more than once.')
  })

  it('explains an unknown state without echoing a raw key', () => {
    expect(workflowIssueText({ code: 'unknown_state', key: 'x' })).toBe(
      'A step is placed under a state that does not exist.',
    )
  })
})
