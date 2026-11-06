import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Role } from '@/constants/roles'
import { makeTestDb, type TestDb } from '@/test/db'
import { homeKeysFor } from '@/test/homeFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const NOW = new Date('2027-03-02T15:00:00Z')
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function keysOf(role: Role) {
  return await homeKeysFor(handle.db, await staffActor(handle.db, role), NOW)
}

describe('which areas Today shows', () => {
  it('shows a clerk every area the clerk can work, not only applications', async () => {
    const keys = await keysOf('staff')
    expect(keys).toEqual(
      expect.arrayContaining([
        'applications',
        'enforcement',
        'payments',
        'records',
        'packets',
        'inspections',
      ]),
    )
    expect(keys).not.toContain('system')
  })

  it('keeps the System region for an admin and adds the areas an admin can work', async () => {
    const keys = await keysOf('admin')
    expect(keys).toEqual(expect.arrayContaining(['system', 'payments', 'packets']))
    for (const key of ['applications', 'enforcement', 'inspections'] as const) {
      expect(keys).not.toContain(key)
    }
  })

  it('leaves out each area whose page the viewer cannot open', async () => {
    const finance = await keysOf('finance')
    expect(finance).toContain('payments')
    for (const key of [
      'applications',
      'enforcement',
      'packets',
      'records',
      'inspections',
      'system',
    ] as const) {
      expect(finance).not.toContain(key)
    }
    const inspector = await keysOf('inspector')
    expect(inspector).toEqual(expect.arrayContaining(['inspections', 'enforcement']))
    for (const key of ['applications', 'packets', 'payments', 'records'] as const) {
      expect(inspector).not.toContain(key)
    }
  })

  it('shows each area once', async () => {
    for (const role of ['staff', 'admin', 'finance', 'records_custodian', 'inspector'] as const) {
      const keys = await keysOf(role)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})
