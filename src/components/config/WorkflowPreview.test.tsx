// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkflowPreview } from '@/components/config/WorkflowPreview'
import type { WorkflowPreview as Preview } from '@/features/workflow/previewWorkflow'
import { findIsoDates } from '@/test/leaks'
import type { CivilDate } from '@/types/civilDate'

afterEach(cleanup)

const PREVIEW: Preview = {
  issues: [{ code: 'missing_required_substep', state: 'under_review', key: 'hearing' }],
  steps: [
    {
      state: 'under_review',
      substeps: [{ key: 'deliberation', label: 'Deliberation' }],
      gates: [
        {
          key: 'nh.ri.determination',
          label: 'Regional impact determination recorded',
          kind: 'statutory',
          outcome: 'pass',
        },
      ],
      clocks: [
        {
          ruleKey: 'nh.pb.decision',
          label: 'Planning Board decision deadline',
          due: '2027-06-18' as CivilDate,
          consequence:
            'RSA 676:4 I(c)(1) states no consequence for a late decision. The application shows as overdue.',
        },
      ],
      notices: [
        {
          requirementKey: 'nh.pb.notice_req.mail',
          label: 'Planning Board mailed notice to the parties',
          channel: 'Verified mail',
          due: '2027-04-04' as CivilDate,
        },
      ],
    },
    { state: 'decided', substeps: [], gates: [], clocks: [], notices: [] },
  ],
}

describe('WorkflowPreview', () => {
  it("shows each clock's consequence", () => {
    render(<WorkflowPreview preview={PREVIEW} />)
    expect(screen.getByText(/states no consequence for a late decision/)).toBeTruthy()
    expect(screen.getByText('Planning Board decision deadline')).toBeTruthy()
  })

  it('shows dates in words and never as ISO dates or rule keys', () => {
    const { container } = render(<WorkflowPreview preview={PREVIEW} />)
    const text = container.textContent
    expect(text).toContain('June 18, 2027')
    expect(findIsoDates(text)).toEqual([])
    expect(text).not.toContain('nh.pb.decision')
  })

  it('shows issues in plain words beside the preview', () => {
    render(<WorkflowPreview preview={PREVIEW} />)
    expect(screen.getByRole('alert').textContent).toContain('Under review needs a Hearing step')
  })

  it('shows notices with their channel and due date', () => {
    render(<WorkflowPreview preview={PREVIEW} />)
    expect(screen.getByText(/Verified mail, due April 4, 2027/)).toBeTruthy()
  })

  it('shows a gate outcome in words', () => {
    render(<WorkflowPreview preview={PREVIEW} />)
    expect(screen.getByText('Regional impact determination recorded: Passes')).toBeTruthy()
  })
})
