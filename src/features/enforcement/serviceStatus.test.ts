import { describe, expect, it } from 'vitest'
import {
  type ServiceCheck,
  type ServiceEvent,
  type ServiceRecipient,
  serviceStatus,
} from '@/features/enforcement/serviceStatus'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const rule = (() => {
  const found = ruleByKey(loadPack(), 'nh.enf.cd_zoning')
  if (found.kind !== 'cease_and_desist') throw new Error('rule')
  return found
})()

const NONE: ServiceCheck['outcome'] = 'none_exist'
const OTHER_ROLES = ['occupying_tenant', 'person_in_control', 'mortgagee_of_record'] as const

function noneExist(roles: readonly ServiceCheck['role'][]): ServiceCheck[] {
  return roles.map((role) => ({ role, outcome: NONE }))
}

const owner: ServiceRecipient = { id: 'r-owner', role: 'record_owner' }
const posting = (on: string, id = 'e-post'): ServiceEvent => ({
  id,
  recipientId: null,
  method: 'posting_on_property',
  servedOn: d(on),
})
const insertion = (on: string): ServiceEvent => ({
  id: `e-${on}`,
  recipientId: null,
  method: 'newspaper_publication',
  servedOn: d(on),
})
const personal = (recipientId: string, on: string): ServiceEvent => ({
  id: `e-${recipientId}`,
  recipientId,
  method: 'in_hand',
  servedOn: d(on),
})

const OWNER_NOT_FOUND: ServiceCheck = { role: 'record_owner', outcome: 'owner_not_found' }

describe('serviceStatus', () => {
  it('owner served and every other role none_exist is complete', () => {
    const status = serviceStatus(rule, {
      checks: [
        { role: 'record_owner', outcome: 'recipients_listed' },
        { role: 'taxpayer', outcome: 'same_as_owner' },
        ...noneExist(OTHER_ROLES),
      ],
      recipients: [owner],
      events: [personal('r-owner', '2027-03-01')],
    })
    expect(status.complete).toBe(true)
    expect(status.missing).toEqual([])
    expect(status.servedOn).toEqual({ 'r-owner': '2027-03-01' })
  })

  it('posting and publication satisfy only the owner role', () => {
    const status = serviceStatus(rule, {
      checks: [
        OWNER_NOT_FOUND,
        { role: 'taxpayer', outcome: 'same_as_owner' },
        { role: 'occupying_tenant', outcome: 'recipients_listed' },
        { role: 'person_in_control', outcome: NONE },
        { role: 'mortgagee_of_record', outcome: NONE },
      ],
      recipients: [owner, { id: 'r-tenant', role: 'occupying_tenant' }],
      events: [
        posting('2027-03-02'),
        insertion('2027-03-04'),
        insertion('2027-03-11'),
        insertion('2027-03-18'),
        insertion('2027-03-25'),
      ],
    })
    expect(status.fallbackCompletedOn).toBe('2027-03-25')
    expect(status.complete).toBe(false)
    expect(status.missing).toEqual([{ role: 'occupying_tenant', reason: 'unserved' }])
  })

  it('three weekly insertions are publication_incomplete', () => {
    const status = serviceStatus(rule, {
      checks: [
        OWNER_NOT_FOUND,
        { role: 'taxpayer', outcome: 'same_as_owner' },
        ...noneExist(OTHER_ROLES),
      ],
      recipients: [owner],
      events: [
        posting('2027-03-02'),
        insertion('2027-03-04'),
        insertion('2027-03-11'),
        insertion('2027-03-18'),
      ],
    })
    expect(status.complete).toBe(false)
    expect(status.fallbackCompletedOn).toBeNull()
    expect(status.missing).toEqual([{ role: 'record_owner', reason: 'publication_incomplete' }])
  })

  it('insertions on 2027-03-04, 2027-03-11, 2027-03-18, 2027-03-25 with posting 2027-03-02 complete on 2027-03-25', () => {
    const status = serviceStatus(rule, {
      checks: [
        OWNER_NOT_FOUND,
        { role: 'taxpayer', outcome: 'same_as_owner' },
        ...noneExist(OTHER_ROLES),
      ],
      recipients: [owner],
      events: [
        posting('2027-03-02'),
        insertion('2027-03-04'),
        insertion('2027-03-11'),
        insertion('2027-03-18'),
        insertion('2027-03-25'),
      ],
    })
    expect(status.complete).toBe(true)
    expect(status.fallbackCompletedOn).toBe('2027-03-25')
    expect(status.servedOn['r-owner']).toBe('2027-03-25')
  })

  it('two insertions in one ISO week count once', () => {
    const status = serviceStatus(rule, {
      checks: [
        OWNER_NOT_FOUND,
        { role: 'taxpayer', outcome: 'same_as_owner' },
        ...noneExist(OTHER_ROLES),
      ],
      recipients: [owner],
      events: [
        posting('2027-03-02'),
        insertion('2027-03-03'),
        insertion('2027-03-04'),
        insertion('2027-03-11'),
        insertion('2027-03-18'),
      ],
    })
    expect(status.complete).toBe(false)
    expect(status.fallbackCompletedOn).toBeNull()
  })

  it('a posting later than the last insertion completes the fallback on the posting date', () => {
    const status = serviceStatus(rule, {
      checks: [
        OWNER_NOT_FOUND,
        { role: 'taxpayer', outcome: 'same_as_owner' },
        ...noneExist(OTHER_ROLES),
      ],
      recipients: [owner],
      events: [
        posting('2027-03-30'),
        insertion('2027-03-04'),
        insertion('2027-03-11'),
        insertion('2027-03-18'),
        insertion('2027-03-25'),
      ],
    })
    expect(status.fallbackCompletedOn).toBe('2027-03-30')
  })

  it('publication without a posting is publication_incomplete', () => {
    const status = serviceStatus(rule, {
      checks: [
        OWNER_NOT_FOUND,
        { role: 'taxpayer', outcome: 'same_as_owner' },
        ...noneExist(OTHER_ROLES),
      ],
      recipients: [owner],
      events: [
        insertion('2027-03-04'),
        insertion('2027-03-11'),
        insertion('2027-03-18'),
        insertion('2027-03-25'),
      ],
    })
    expect(status.complete).toBe(false)
  })

  it('weeks that straddle New Year count as consecutive', () => {
    const status = serviceStatus(rule, {
      checks: [
        OWNER_NOT_FOUND,
        { role: 'taxpayer', outcome: 'same_as_owner' },
        ...noneExist(OTHER_ROLES),
      ],
      recipients: [owner],
      events: [
        posting('2026-12-20'),
        insertion('2026-12-22'),
        insertion('2026-12-29'),
        insertion('2027-01-05'),
        insertion('2027-01-12'),
      ],
    })
    expect(status.fallbackCompletedOn).toBe('2027-01-12')
  })

  it('taxpayer same_as_owner resolves the taxpayer role', () => {
    const status = serviceStatus(rule, {
      checks: [{ role: 'taxpayer', outcome: 'same_as_owner' }],
      recipients: [],
      events: [],
    })
    expect(status.missing.map((m) => m.role)).not.toContain('taxpayer')
  })

  it('a role with no check is no_check', () => {
    const status = serviceStatus(rule, { checks: [], recipients: [], events: [] })
    expect(status.complete).toBe(false)
    expect(status.missing).toContainEqual({ role: 'taxpayer', reason: 'no_check' })
    expect(status.missing).toContainEqual({ role: 'mortgagee_of_record', reason: 'no_check' })
    expect(status.missing).toContainEqual({ role: 'record_owner', reason: 'no_check' })
  })

  it('a mortgagee listed but unserved is unserved until a service event exists', () => {
    const base = {
      checks: [
        { role: 'record_owner', outcome: 'recipients_listed' },
        { role: 'taxpayer', outcome: 'same_as_owner' },
        { role: 'occupying_tenant', outcome: NONE },
        { role: 'person_in_control', outcome: NONE },
        { role: 'mortgagee_of_record', outcome: 'recipients_listed' },
      ] as ServiceCheck[],
      recipients: [owner, { id: 'r-bank', role: 'mortgagee_of_record' }] as ServiceRecipient[],
    }
    const before = serviceStatus(rule, {
      ...base,
      events: [personal('r-owner', '2027-03-01')],
    })
    expect(before.missing).toEqual([{ role: 'mortgagee_of_record', reason: 'unserved' }])
    const after = serviceStatus(rule, {
      ...base,
      events: [personal('r-owner', '2027-03-01'), personal('r-bank', '2027-03-03')],
    })
    expect(after.complete).toBe(true)
  })

  it('a recipient service date is its earliest service event', () => {
    const status = serviceStatus(rule, {
      checks: [{ role: 'record_owner', outcome: 'recipients_listed' }],
      recipients: [owner],
      events: [
        personal('r-owner', '2027-03-05'),
        { ...personal('r-owner', '2027-03-01'), id: 'e2' },
      ],
    })
    expect(status.servedOn['r-owner']).toBe('2027-03-01')
  })
})
