// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { findIsoDates, findRawKeys } from '@/test/leaks'

vi.mock('./actions', () => ({}))
vi.mock('./clockFeeActions', () => ({}))
vi.mock('./buildingActions', () => ({}))
vi.mock('../../reviews/actions', () => ({
  assignReviewerAction: () => Promise.resolve({ ok: true, message: '' }),
  removeReviewerAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { RegionalImpactPanel } = await import('./buildingPanels')
const { AppealsPanel } = await import('./appealsPanel')
const { CompletenessPanel, PartiesPanel } = await import('./panels')
const { ReviewersPanel } = await import('./reviewersPanel')

afterEach(cleanup)

const RAW_KEYS = [
  'previously_determined',
  'regional_planning_commission',
  'certified_mail',
  'permit_upheld',
  'signed_off',
]

function textOf(node: React.ReactElement): string {
  const { container } = render(<CsrfProvider token="t">{node}</CsrfProvider>)
  return container.textContent
}

function view(overrides: Record<string, unknown>): StaffApplicationView {
  return {
    id: 'a1',
    state: 'under_review',
    today: '2026-11-02',
    classification: 'nh.building_permit',
    completedDate: null,
    permissions: {},
    parties: [],
    appeals: [],
    regionalImpact: { applies: false, determination: null, notices: [] },
    ...overrides,
  } as unknown as StaffApplicationView
}

describe('staff application panels', () => {
  it('completeness shows the completion date in words', () => {
    const text = textOf(<CompletenessPanel view={view({ completedDate: '2026-11-02' })} />)
    expect(text).toContain('Marked complete on November 2, 2026.')
    expect(findIsoDates(text)).toEqual([])
  })

  it('regional impact shows determination and notices in words', () => {
    const text = textOf(
      <RegionalImpactPanel
        view={view({
          regionalImpact: {
            applies: true,
            determination: {
              determination: 'previously_determined',
              determinedOn: '2026-11-02',
              previousBoardRef: 'ZBA-12',
            },
            notices: [
              {
                id: 'n1',
                recipientName: 'Lakes Region Commission',
                recipientKind: 'regional_planning_commission',
                method: 'certified_mail',
                mailedOn: '2026-11-03',
              },
            ],
          },
        })}
      />,
    )
    expect(text).toContain(
      'Determination: previously determined by another board on November 2, 2026 (board reference ZBA-12).',
    )
    expect(text).toContain(
      'Lakes Region Commission (regional planning commission), certified mail, mailed November 3, 2026',
    )
    expect(findIsoDates(text.replace('Determined on', ''))).toEqual([])
    expect(findRawKeys(text, RAW_KEYS)).toEqual([])
  })

  it('appeals show filed and resolved dates and the outcome in words', () => {
    const text = textOf(
      <AppealsPanel
        graph={[]}
        view={view({
          appeals: [
            {
              id: 'p1',
              filedOn: '2026-11-02',
              appellantName: 'Pat Smith',
              resolvedOn: '2026-11-20',
              outcome: 'permit_upheld',
            },
          ],
        })}
      />,
    )
    expect(text).toContain(
      'Filed November 2, 2026 by Pat Smith. Resolved November 20, 2026: permit upheld.',
    )
    expect(findIsoDates(text)).toEqual([])
    expect(findRawKeys(text, RAW_KEYS)).toEqual([])
  })

  it('parties show the role label once', () => {
    const text = textOf(
      <PartiesPanel
        view={view({
          parties: [
            {
              id: 'x',
              name: 'Applicant',
              role: 'applicant',
              ownerAuthorizationOnFile: false,
              linked: true,
            },
          ],
        })}
      />,
    )
    expect(text).toContain('Applicant')
    expect(text).not.toMatch(/Applicant, applicant/)
    expect(text).not.toContain('applicant')
  })

  it('reviewers show the status label', () => {
    const text = textOf(
      <ReviewersPanel
        applicationId="a1"
        reviewers={[{ assignmentId: 'r1', name: 'Remy Reviewer', status: 'signed_off' }] as never}
        choices={[]}
        canAssign={false}
      />,
    )
    expect(text).toContain('Remy Reviewer, Signed off')
    expect(findRawKeys(text, RAW_KEYS)).toEqual([])
  })

  it('each remove button names its reviewer and assigned reviewers are not offered again', () => {
    const { getByRole, queryByRole } = render(
      <CsrfProvider token="t">
        <ReviewersPanel
          applicationId="a1"
          reviewers={
            [
              {
                assignmentId: 'r1',
                reviewerUserId: 'u1',
                name: 'Remy Reviewer',
                status: 'pending',
              },
              { assignmentId: 'r2', reviewerUserId: 'u2', name: 'Faye Fire', status: 'pending' },
            ] as never
          }
          choices={[
            { id: 'u1', name: 'Remy Reviewer' },
            { id: 'u2', name: 'Faye Fire' },
            { id: 'u3', name: 'Wes Works' },
          ]}
          canAssign
        />
      </CsrfProvider>,
    )
    expect(getByRole('button', { name: 'Remove Remy Reviewer' })).toBeTruthy()
    expect(getByRole('button', { name: 'Remove Faye Fire' })).toBeTruthy()
    expect(queryByRole('option', { name: 'Faye Fire' })).toBeNull()
    expect(getByRole('option', { name: 'Wes Works' })).toBeTruthy()
  })
})
