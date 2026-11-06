// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { expectRefusalBeside } from '@/test/besideField'

const refusal = vi.hoisted(() => ({ field: '', message: '' }))
const answer = vi.hoisted(
  () => () =>
    Promise.resolve({
      ok: false as const,
      error: refusal.message,
      fieldErrors: { [refusal.field]: refusal.message },
    }),
)

vi.mock('./actions', () => ({ recordCodeEditionAction: answer }))
vi.mock('./buildingActions', () => ({
  regionalImpactAction: answer,
  regionalNoticeAction: answer,
  recordAppealAction: answer,
  resolveAppealAction: answer,
  renewAction: answer,
}))
vi.mock('./notesActions', () => ({ addApplicationNoteAction: answer }))
vi.mock('./responsibleActions', () => ({ setResponsibleStaffAction: answer }))
vi.mock('../../reviews/actions', () => ({
  assignReviewerAction: answer,
  removeReviewerAction: answer,
  addReviewCommentAction: answer,
}))

const { RegionalImpactPanel } = await import('./buildingPanels')
const { AppealsPanel } = await import('./appealsPanel')
const { NotesPanel } = await import('./notesPanel')
const { ResponsibleStaff } = await import('./responsibleStaff')
const { ReviewersPanel } = await import('./reviewersPanel')
const { MoreActions } = await import('./nextStepCard')
const { CommentsSection } = await import('../../reviews/[assignmentId]/commentsSection')

afterEach(cleanup)

function inProvider(node: ReactNode) {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
}

function refuseWith(field: string, message: string) {
  refusal.field = field
  refusal.message = message
}

function view(overrides: Record<string, unknown>): StaffApplicationView {
  return {
    id: 'a1',
    state: 'under_review',
    today: '2026-11-06',
    permissions: { canIssue: true, canDetermineRegionalImpact: true },
    appeals: [],
    regionalImpact: { applies: true, determination: null, notices: [] },
    ...overrides,
  } as unknown as StaffApplicationView
}

describe('record forms show a refusal beside its field', () => {
  it('the regional impact determination date', async () => {
    refuseWith('determinedOn', 'Enter the determination date as a date.')
    inProvider(<RegionalImpactPanel view={view({})} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record determination' }))
    await expectRefusalBeside(
      screen.getByLabelText(/Determined on/),
      'Enter the determination date as a date.',
    )
  })

  it('the regional notice recipient name', async () => {
    refuseWith('recipientName', 'Enter the recipient name.')
    const impact = {
      applies: true,
      determination: { determination: 'yes', determinedOn: '2026-11-01', previousBoardRef: null },
      notices: [],
    }
    inProvider(<RegionalImpactPanel view={view({ regionalImpact: impact })} />)
    fireEvent.change(screen.getByLabelText(/Recipient name/), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record notice' }))
    await expectRefusalBeside(screen.getByLabelText(/Recipient name/), 'Enter the recipient name.')
  })

  it('the appellant name', async () => {
    refuseWith('appellantName', 'Enter the appellant name.')
    inProvider(<AppealsPanel view={view({ state: 'issued' })} graph={[]} />)
    fireEvent.change(screen.getByLabelText(/Appellant/), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record appeal' }))
    await expectRefusalBeside(screen.getByLabelText(/Appellant/), 'Enter the appellant name.')
  })

  it('the renewal date', async () => {
    refuseWith('renewedOn', 'Enter the renewal date as a date.')
    inProvider(<MoreActions view={view({ state: 'issued' })} moves={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Renew permit' }))
    await expectRefusalBeside(
      screen.getByLabelText(/Renewed on/),
      'Enter the renewal date as a date.',
    )
  })

  it('the staff note', async () => {
    refuseWith('body', 'Enter a note.')
    inProvider(<NotesPanel applicationId="a1" notes={[]} canAdd zone="America/New_York" />)
    fireEvent.change(screen.getByRole('textbox', { name: /Note/ }), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await expectRefusalBeside(screen.getByRole('textbox', { name: /Note/ }), 'Enter a note.')
  })

  it('the responsible staff member', async () => {
    refuseWith('userId', 'Choose an active town staff member.')
    inProvider(
      <ResponsibleStaff
        applicationId="a1"
        data={{ current: null, choices: [{ id: 'u1', name: 'Pat Planner' }], canManage: true }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await expectRefusalBeside(
      screen.getByRole('combobox', { name: 'Responsible staff member' }),
      'Choose an active town staff member.',
    )
  })

  it('the reviewer to assign', async () => {
    refuseWith('reviewerUserId', 'That person does not have the reviewer role.')
    inProvider(
      <ReviewersPanel
        applicationId="a1"
        reviewers={[]}
        choices={[{ id: 'u1', name: 'Rae Reviewer' }]}
        canAssign
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Assign reviewer' }))
    await expectRefusalBeside(
      screen.getByRole('combobox', { name: 'Reviewer' }),
      'That person does not have the reviewer role.',
    )
  })

  it('the review comment', async () => {
    refuseWith('body', 'Enter a comment.')
    const assignment = { assignmentId: 'r1', comments: [], status: 'pending' }
    inProvider(<CommentsSection view={assignment as never} zone="America/New_York" />)
    fireEvent.change(screen.getByRole('textbox', { name: /Comment/ }), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    await expectRefusalBeside(screen.getByRole('textbox', { name: /Comment/ }), 'Enter a comment.')
  })
})
