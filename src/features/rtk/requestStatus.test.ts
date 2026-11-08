import { describe, expect, it } from 'vitest'
import { requestChipStatus, requestRowChipStatus } from '@/features/rtk/requestStatus'
import type { RtkRequestView } from '@/features/rtk/requests'
import type { CivilDate } from '@/types/civilDate'

const due = (on: string) => ({ due: on }) as unknown as RtkRequestView['responseDue']

function view(patch: Partial<RtkRequestView>): RtkRequestView {
  return {
    status: 'open',
    firstResponseKind: null,
    responseDue: due('2026-11-09'),
    statedDue: null,
    current: { kind: 'running', dueOn: '2026-11-09' as CivilDate, daysRemaining: 4 },
    ...patch,
  } as RtkRequestView
}

describe('requestChipStatus', () => {
  it('marks an open request past its date as overdue and a responded one as passed', () => {
    expect(
      requestChipStatus(
        view({ current: { kind: 'overdue', dueOn: '2026-10-27' as CivilDate, daysOverdue: 7 } }),
      ),
    ).toBe('overdue')
    expect(requestChipStatus(view({}))).toBe('neutral')
    expect(requestChipStatus(view({ status: 'responded', current: null }))).toBe('passed')
    expect(requestChipStatus(view({ status: 'closed', current: null }))).toBe('neutral')
  })
})

describe('requestRowChipStatus', () => {
  it('marks a list row past its next date as overdue whatever its status', () => {
    expect(requestRowChipStatus('responded', true)).toBe('overdue')
  })

  it('shows a responded request as passed and anything else as neutral', () => {
    expect(requestRowChipStatus('responded', false)).toBe('passed')
    expect(requestRowChipStatus('open', false)).toBe('neutral')
    expect(requestRowChipStatus('closed', false)).toBe('neutral')
  })
})
