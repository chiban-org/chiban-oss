import { describe, expect, it } from 'vitest'
import type { ClockAdjustmentRow } from '@/features/clocks/clockOverrides'
import {
  arrangeClockAdjustments,
  readClockAdjustmentView,
} from '@/features/overrides/clockOverrideView'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'

function adjustment(
  id: string,
  patch: Partial<ClockAdjustmentRow> & { status: OverrideStatus },
): ClockAdjustmentRow {
  return {
    id,
    clockId: `c-${id}`,
    kind: 'extension',
    days: 14,
    newDue: '2027-05-01',
    reason: 'Applicant asked',
    legalAuthority: null,
    supersededBy: null,
    createdBy: 'u',
    createdAt: new Date('2027-01-01T00:00:00Z'),
    ruleKey: 'nh.bp.decision',
    applicationId: `app-${id}`,
    applicationNumber: `BP-2027-000${id}`,
    ...patch,
  } as ClockAdjustmentRow
}

const ROWS = [
  adjustment('2', { status: 'applied', kind: 'waiver', newDue: null }),
  adjustment('3', { status: 'superseded', kind: 'renewal', newDue: '2027-03-01', reason: 'Asked' }),
  adjustment('1', { status: 'applied', kind: 'tolling', newDue: '2028-01-01' }),
]
const ids = (raw: Record<string, string | string[]>) =>
  arrangeClockAdjustments(ROWS, readClockAdjustmentView(raw)).rows.map((r) => r.id)

describe('clock adjustments view', () => {
  it('keeps the newest-first list order by default', () => {
    expect(ids({})).toEqual(['2', '3', '1'])
  })

  it('sorts by application number, adjustment name, new due date and reason', () => {
    expect(ids({ sort: 'application' })).toEqual(['1', '2', '3'])
    expect(ids({ sort: 'adjustment' })).toEqual(['3', '1', '2'])
    expect(ids({ sort: 'due' })).toEqual(['3', '1', '2'])
    expect(ids({ sort: 'reason' })).toEqual(['2', '1', '3'])
  })

  it('filters by status and by kind of adjustment with counts against the other group', () => {
    expect(ids({ status: 'applied' })).toEqual(['2', '1'])
    expect(ids({ status: 'applied', kind: 'waiver' })).toEqual(['2'])
    const { chips } = arrangeClockAdjustments(ROWS, readClockAdjustmentView({ status: 'applied' }))
    expect(chips.map((g) => g.label)).toEqual(['Status', 'Adjustment'])
    expect(chips[1]?.chips.map((c) => [c.label, c.count])).toEqual([
      ['Extension', 0],
      ['Waiver', 1],
      ['Renewal', 0],
      ['Tolling', 1],
      ['Statutory exception', 0],
      ['Statutory minimum', 0],
    ])
  })
})
