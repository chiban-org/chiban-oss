// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ClockCard } from '@/components/clocks/ClockCard'
import type { ClockExplanation } from '@/features/clocks/explainClock'
import type { CivilDate } from '@/types/civilDate'

afterEach(cleanup)
const d = (s: string) => s as CivilDate

const BASE: ClockExplanation & { clockId: string } = {
  clockId: 'c1',
  ruleLabel: 'Building permit decision deadline',
  citation: { label: 'RSA 155-A:4 IX', url: 'https://gc.nh.gov/rsa/html/XII/155-A/155-A-4.htm' },
  ruleKey: 'nh.bp.decision',
  ruleVersion: 1,
  packVersion: '0.2.0',
  startEvent: 'Application completed',
  startDate: d('2027-03-01'),
  countingMethod:
    '30 calendar days after 2027-03-01. Start day excluded, last day included (RSA 21:35 I).',
  computedDue: d('2027-03-31'),
  currentDue: {
    value: d('2027-04-14'),
    source: 'manual_override',
    replaced: { value: d('2027-03-31'), source: 'pack_rule' },
  },
  rolledFrom: null,
  adjustments: [
    {
      kind: 'statutory_exception',
      days: 14,
      newDue: d('2027-04-14'),
      reason: 'Court order extends the review',
      legalAuthority: {
        citation: 'Superior Court order 2027-03-10',
        explanation: 'Stay of review',
      },
      by: 'admin',
      at: new Date('2027-03-12T15:00:00Z'),
    },
  ],
  consequence:
    'RSA 155-A:4 IX states no consequence for a missed deadline. The application shows as overdue.',
  consequenceKind: 'none_stated',
  whose: 'official',
  extensionPolicy: 'RSA 155-A:4 IX provides no extension.',
  status: 'running',
  daysRemaining: 10,
}

describe('ClockCard', () => {
  it('shows rule, version, start event, counting method, consequence, and each adjustment', () => {
    render(<ClockCard clock={BASE} />)
    const card = screen.getByRole('article')
    expect(within(card).getByText('Building permit decision deadline')).toBeTruthy()
    expect(within(card).getByText(/nh\.bp\.decision version 1/)).toBeTruthy()
    expect(within(card).getByText(/Application completed/)).toBeTruthy()
    expect(within(card).getByText(/30 calendar days after 2027-03-01/)).toBeTruthy()
    expect(within(card).getByText(/states no consequence for a missed deadline/)).toBeTruthy()
    expect(within(card).getByText(/Court order extends the review/)).toBeTruthy()
    expect(within(card).getByText(/Superior Court order 2027-03-10/)).toBeTruthy()
    expect(within(card).getByText(/Stay of review/)).toBeTruthy()
    expect(
      within(card).getByRole('link', { name: 'RSA 155-A:4 IX' }).getAttribute('href'),
    ).toContain('155-A-4')
  })

  it('shows the adjusted due date next to the date it replaced', () => {
    render(<ClockCard clock={BASE} />)
    expect(screen.getByText('2027-04-14', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByText(/Adjusted from 2027-03-31/)).toBeTruthy()
  })

  it('says who acts and whether the clock can be extended', () => {
    render(<ClockCard clock={BASE} />)
    expect(screen.getByText(/Municipal official/)).toBeTruthy()
    expect(screen.getByText(/provides no extension/)).toBeTruthy()
  })

  it('shows a town setting date with the pack default it replaced', () => {
    const clock = {
      ...BASE,
      adjustments: [],
      currentDue: {
        value: d('2028-09-15'),
        source: 'town_setting' as const,
        replaced: { value: d('2028-03-15'), source: 'pack_rule' as const },
      },
    }
    render(<ClockCard clock={clock} />)
    expect(screen.getByText(/Town setting/)).toBeTruthy()
    expect(screen.getByText(/pack default would be 2028-03-15/)).toBeTruthy()
  })

  it('for an overdue clock uses the overdue chip with a text label', () => {
    render(<ClockCard clock={{ ...BASE, status: 'overdue', daysRemaining: -5 }} />)
    const chip = screen.getByText('Overdue by 5 days').closest('[data-status]')
    expect(chip?.getAttribute('data-status')).toBe('overdue')
  })

  it('labels running, met, lapsed, and superseded clocks in words', () => {
    for (const [status, label, chip] of [
      ['running', '10 days remaining', 'neutral'],
      ['met', 'Met', 'passed'],
      ['lapsed', 'Lapsed', 'failed'],
      ['superseded', 'Superseded by a rule change', 'neutral'],
      ['stopped', 'Stopped', 'neutral'],
    ] as const) {
      const { unmount } = render(<ClockCard clock={{ ...BASE, status }} />)
      expect(screen.getByText(label).closest('[data-status]')?.getAttribute('data-status')).toBe(
        chip,
      )
      unmount()
    }
  })

  it('shows the rolled-from date for a filing window', () => {
    render(
      <ClockCard
        clock={{
          ...BASE,
          adjustments: [],
          currentDue: { value: d('2027-07-06'), source: 'pack_rule', replaced: null },
          rolledFrom: d('2027-07-04'),
        }}
      />,
    )
    expect(screen.getByText(/Rolled forward from 2027-07-04/)).toBeTruthy()
  })
})
