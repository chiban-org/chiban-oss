// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FeeBalance } from '@/features/ledger/feeBalance'
import type { PortalApplicationView } from '@/features/portal/portalView'
import { FeesPanel } from './feesPanel'

afterEach(cleanup)

const NOTHING_DUE: FeeBalance = { lines: [], dueCents: 0, pendingAttempts: 0, unknownAttempts: 0 }

const BALANCE_DUE: FeeBalance = {
  lines: [
    {
      stage: 'at_intake',
      feeCode: 'base',
      label: 'Permit fee',
      feeAssessmentId: 'a1',
      assessedCents: 4500,
      paidCents: 0,
      dueCents: 4500,
    },
  ],
  dueCents: 4500,
  pendingAttempts: 0,
  unknownAttempts: 0,
}

function viewOf(patch: Partial<PortalApplicationView>): PortalApplicationView {
  return {
    applicationId: 'app-1',
    state: 'draft',
    fees: NOTHING_DUE,
    feeEstimate: null,
    canPay: false,
    payAtOffice: false,
    history: [],
    ...patch,
  } as PortalApplicationView
}

describe('FeesPanel', () => {
  it('explains a draft estimate comes from the saved answers and is due on submission', () => {
    render(
      <FeesPanel
        view={viewOf({ feeEstimate: { totalCents: 35000, due: 'at_intake' } })}
        officeName="Fernhollow Permit Office"
      />,
    )
    expect(
      screen.getByText(
        'No fees are due yet. From the answers saved so far, the estimated fee is $350.00, due when the application is submitted. Save the draft to update it.',
      ),
    ).toBeTruthy()
  })

  it('says where to pay when the town takes no card payments online', () => {
    render(
      <FeesPanel
        view={viewOf({ state: 'submitted', fees: BALANCE_DUE, payAtOffice: true })}
        officeName="Fernhollow Permit Office"
      />,
    )
    expect(screen.getByText('Pay $45.00 at the Fernhollow Permit Office.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Pay online/ })).toBeNull()
  })

  it('links to the online payment when the town takes cards', () => {
    render(
      <FeesPanel
        view={viewOf({ state: 'submitted', fees: BALANCE_DUE, canPay: true })}
        officeName="Fernhollow Permit Office"
      />,
    )
    expect(screen.getByRole('link', { name: 'Pay online from the top of this page' })).toBeTruthy()
    expect(screen.queryByText(/at the Fernhollow Permit Office/)).toBeNull()
  })
})
