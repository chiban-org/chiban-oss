import { describe, expect, it } from 'vitest'
import {
  requestChipStatus,
  requestNextStep,
  requestRowChipStatus,
} from '@/features/rtk/requestStatus'
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

describe('requestNextStep', () => {
  it('asks for the first response while the clock runs, leaving the date to the deadline card', () => {
    expect(requestNextStep(view({}))).toBe('Send the first response before the deadline.')
  })

  it('says the first response is late once the date has passed', () => {
    const late = view({
      current: { kind: 'overdue', dueOn: '2026-10-27' as CivilDate, daysOverdue: 7 },
    })
    expect(requestNextStep(late)).toBe('The deadline has passed. Send the first response now.')
  })

  it('points at the date the town stated while waiting on it', () => {
    const waiting = view({
      status: 'awaiting_decision',
      firstResponseKind: 'time_statement',
      statedDue: due('2026-12-01'),
    })
    expect(requestNextStep(waiting)).toBe(
      'Release the records or deny the request by the date the town stated.',
    )
  })

  it('asks to release and close once the town has responded', () => {
    expect(requestNextStep(view({ status: 'responded', firstResponseKind: 'denied' }))).toBe(
      'Release any approved records, then close the request.',
    )
  })

  it('has nothing to do for a closed or withdrawn request', () => {
    expect(requestNextStep(view({ status: 'closed' }))).toBeNull()
    expect(requestNextStep(view({ status: 'withdrawn' }))).toBeNull()
  })
})

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
