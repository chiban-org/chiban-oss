// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GatePanel } from '@/components/gates/GatePanel'
import type { GateResult } from '@/features/gates/evaluateGates'

afterEach(cleanup)

const base = {
  key: 'nh.bp.regional_impact',
  label: 'Regional impact determination and comment period',
  citation: { label: 'RSA 36:57 IV', url: 'https://gc.nh.gov/rsa/html/III/36/36-57.htm' },
  kind: 'statutory' as const,
}

const BLOCKED: GateResult = {
  ...base,
  outcome: {
    status: 'unknown',
    reason: 'Regional impact determination not recorded (RSA 36:57 IV).',
  },
  override: null,
  effective: 'blocked',
}

describe('GatePanel', () => {
  it('shows the cited authority on a statutory exception', () => {
    const excepted: GateResult = {
      ...BLOCKED,
      effective: 'pass',
      override: {
        id: 'o1',
        applicationId: 'a1',
        gateKey: base.key,
        kind: 'statutory_exception',
        reason: null,
        legalAuthority: {
          citation: 'Superior Court order 2027-03-10',
          explanation: 'Stay of review',
        },
        createdBy: 'u1',
        createdAt: new Date('2027-03-12T15:00:00Z'),
        revokedAt: null,
        revokedBy: null,
      },
    }
    render(<GatePanel groups={[{ to: 'issued', results: [excepted] }]} />)
    expect(screen.getByText(/Superior Court order 2027-03-10/)).toBeTruthy()
    expect(screen.getByText(/Stay of review/)).toBeTruthy()
    expect(screen.getByText('Statutory exception recorded')).toBeTruthy()
  })

  it('shows a blocked gate with its reason, kind, and a text status', () => {
    render(<GatePanel groups={[{ to: 'issued', results: [BLOCKED] }]} />)
    expect(screen.getByText('Blocked')).toBeTruthy()
    expect(screen.getByText(/Regional impact determination not recorded/)).toBeTruthy()
    expect(screen.getByText('Statutory')).toBeTruthy()
  })

  it('shows an administrative override with its reason', () => {
    const overridden: GateResult = {
      key: 'conditions.blocking_met',
      label: 'Blocking conditions met',
      citation: null,
      kind: 'administrative',
      outcome: { status: 'blocked', reason: 'Unmet conditions block issuance: SEPTIC.' },
      effective: 'pass',
      override: {
        id: 'o2',
        applicationId: 'a1',
        gateKey: 'conditions.blocking_met',
        kind: 'administrative_override',
        reason: 'Septic design approved by letter',
        legalAuthority: null,
        createdBy: 'u1',
        createdAt: new Date('2027-03-12T15:00:00Z'),
        revokedAt: null,
        revokedBy: null,
      },
    }
    render(<GatePanel groups={[{ to: 'issued', results: [overridden] }]} />)
    expect(screen.getByText(/Septic design approved by letter/)).toBeTruthy()
    expect(screen.getByText('Overridden')).toBeTruthy()
  })

  it('renders injected controls for each gate and says when no gate applies', () => {
    render(
      <GatePanel
        groups={[{ to: 'issued', results: [BLOCKED] }]}
        renderControls={(result) => <button type="button">{`Act on ${result.key}`}</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Act on nh.bp.regional_impact' })).toBeTruthy()
    cleanup()
    render(
      <GatePanel
        groups={[
          { to: 'under_review', results: [] },
          { to: 'issued', results: [BLOCKED] },
        ]}
      />,
    )
    expect(screen.queryByText('No gates apply to this step.')).toBeNull()
    expect(screen.queryByText('Before under review')).toBeNull()
    expect(screen.getByText('Before issued')).toBeTruthy()
    cleanup()
    render(<GatePanel groups={[{ to: 'under_review', results: [] }]} />)
    expect(screen.getByText('No gates apply to the next step.')).toBeTruthy()
  })
})
