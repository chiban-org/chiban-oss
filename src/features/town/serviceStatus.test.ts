import { describe, expect, it } from 'vitest'
import { serviceMode } from '@/features/town/serviceStatus'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

describe('serviceMode', () => {
  const terminated = {
    serviceStatus: 'terminated' as const,
    serviceStatusSince: d('2027-09-30'),
    exportWindowDays: 90,
  }

  it('terminated on 2027-09-30 with 90 days is export_only on 2027-12-29 and closed on 2027-12-30', () => {
    expect(serviceMode(terminated, d('2027-12-29'))).toBe('export_only')
    expect(serviceMode(terminated, d('2027-12-30'))).toBe('closed')
  })

  it('an active town is active whatever the dates say', () => {
    expect(serviceMode({ ...terminated, serviceStatus: 'active' }, d('2030-01-01'))).toBe('active')
  })

  it('a suspended town is export_only from its start date', () => {
    const suspended = { ...terminated, serviceStatus: 'suspended' as const }
    expect(serviceMode(suspended, d('2027-09-30'))).toBe('export_only')
  })

  it('a non-active town with no start date counts from today', () => {
    expect(serviceMode({ ...terminated, serviceStatusSince: null }, d('2030-01-01'))).toBe(
      'export_only',
    )
  })
})
