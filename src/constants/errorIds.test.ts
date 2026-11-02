import { describe, expect, it } from 'vitest'
import { ErrorIds } from '@/constants/errorIds'

describe('ErrorIds', () => {
  const values = Object.values(ErrorIds)

  it('has unique values', () => {
    expect(new Set(values).size).toBe(values.length)
  })

  it('matches the registry format', () => {
    for (const v of values) expect(v).toMatch(/^E_[A-Z]{2,5}_\d{3}$/)
  })

  it('declares the DB, AUTH, AUTHZ, JOB and SEC domains', () => {
    for (const domain of ['DB', 'AUTH', 'AUTHZ', 'JOB', 'SEC']) {
      expect(values.some((v) => v.startsWith(`E_${domain}_`))).toBe(true)
    }
  })
})
