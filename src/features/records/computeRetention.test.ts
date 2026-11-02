import type { RecordSeries } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { computeRetention } from '@/features/records/computeRetention'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const BASE = {
  version: 1,
  label: 'x',
  citation: { label: 'RSA 33-A:3-a I', url: 'https://example.test' },
  preservation: 'original',
} as const

const permanent: RecordSeries = { ...BASE, key: 'p', retention: { kind: 'permanent' } }
const withdrawn: RecordSeries = {
  ...BASE,
  key: 'w',
  retention: {
    kind: 'event',
    events: ['application_withdrawn', 'application_denied'],
    plusYears: 1,
  },
}
const blueprint: RecordSeries = {
  ...BASE,
  key: 'b',
  retention: { kind: 'event', events: ['building_removed'], plusYears: 0 },
}
const oneYear: RecordSeries = { ...BASE, key: 'c', retention: { kind: 'duration', years: 1 } }

describe('computeRetention', () => {
  it('permanent series is permanent', () => {
    expect(computeRetention(permanent, { recordDate: d('2027-01-01'), events: [] })).toEqual({
      state: 'permanent',
    })
  })

  it('withdrawn on 2027-05-03 is eligible on 2028-05-03', () => {
    const status = computeRetention(withdrawn, {
      recordDate: d('2027-01-01'),
      events: [{ kind: 'application_withdrawn', occurredOn: d('2027-05-03') }],
    })
    expect(status).toEqual({ state: 'eligible_on', date: '2028-05-03' })
  })

  it('an event rule uses the earliest matching event', () => {
    const status = computeRetention(withdrawn, {
      recordDate: d('2027-01-01'),
      events: [
        { kind: 'application_denied', occurredOn: d('2027-09-01') },
        { kind: 'application_withdrawn', occurredOn: d('2027-05-03') },
        { kind: 'building_removed', occurredOn: d('2026-01-01') },
      ],
    })
    expect(status).toEqual({ state: 'eligible_on', date: '2028-05-03' })
  })

  it('blueprint with no removal event is not_yet_triggered awaiting building_removed', () => {
    expect(computeRetention(blueprint, { recordDate: d('2027-01-01'), events: [] })).toEqual({
      state: 'not_yet_triggered',
      awaiting: ['building_removed'],
    })
  })

  it('building removed 2040-06-01 is eligible 2040-06-01', () => {
    const status = computeRetention(blueprint, {
      recordDate: d('2027-01-01'),
      events: [{ kind: 'building_removed', occurredOn: d('2040-06-01') }],
    })
    expect(status).toEqual({ state: 'eligible_on', date: '2040-06-01' })
  })

  it('duration from 2028-02-29 lands on 2029-02-28', () => {
    expect(computeRetention(oneYear, { recordDate: d('2028-02-29'), events: [] })).toEqual({
      state: 'eligible_on',
      date: '2029-02-28',
    })
  })
})
