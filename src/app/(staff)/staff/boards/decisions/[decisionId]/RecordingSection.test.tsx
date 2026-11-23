// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { DecisionView } from '@/features/decisions/decisionView'

vi.mock('../../hearings/decisionActions', () => ({
  recordFinalApprovalAction: vi.fn(),
  recordRegistryAction: vi.fn(),
}))
vi.mock('./uploads', () => ({ UPLOAD_ACTIONS: {} }))
vi.mock('@/components/documents/ApplicationFileUploader', () => ({
  ApplicationFileUploader: () => null,
}))

const { RecordingSection } = await import('./RecordingSection')

afterEach(cleanup)

function view(recordingPeriod: string | null): DecisionView {
  return {
    decisionId: 'd1',
    applicationId: 'a1',
    votedOn: '2027-04-15',
    recordingPeriod,
    recording: {
      approvedOn: null,
      approvedText: null,
      minApproval: '2027-04-15',
      recordedText: null,
      voidDueText: null,
      voidLapsed: false,
      certificateChoices: [],
    },
  } as unknown as DecisionView
}

function show(recordingPeriod: string | null) {
  render(
    <CsrfProvider token="t">
      <RecordingSection view={view(recordingPeriod)} today="2027-04-20" />
    </CsrfProvider>,
  )
}

describe('the final written approval date', () => {
  it("names the recording rule's day count under the date", () => {
    show('90 days')
    expect(
      screen.getByText(
        'The date the board signed or issued its written decision. The certificate must be recorded within 90 days of this date or the variance is void.',
      ),
    ).toBeTruthy()
  })

  it('states no period when the pack has no recording rule', () => {
    show(null)
    expect(
      screen.getByText('The date the board signed or issued its written decision.'),
    ).toBeTruthy()
  })
})
