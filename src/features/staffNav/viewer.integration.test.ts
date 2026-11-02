import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { navItemsFor } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDefaultGrants(handle.db, signal)
})
afterAll(async () => {
  await handle.drop()
})

async function labels(
  role: 'finance' | 'records_custodian' | 'reviewer' | 'board_member' | 'admin',
) {
  const actor = await staffActor(handle.db, role)
  const viewer = await loadNavViewer(handle.db, actor, signal)
  return navItemsFor(viewer).map((i) => i.label)
}

describe('loading the navigation viewer from stored grants', () => {
  it('derives each role menu from the stored capabilities', async () => {
    const finance = await labels('finance')
    expect(finance).toContain('Payments')
    expect(finance).not.toEqual(
      expect.arrayContaining(['Export', 'Health', 'Cutover', 'Migration']),
    )
    const custodian = await labels('records_custodian')
    expect(custodian).toEqual(expect.arrayContaining(['Records', 'Legal holds', 'Export']))
    expect(custodian).not.toEqual(expect.arrayContaining(['Health', 'Cutover', 'Migration']))
    const board = await labels('board_member')
    expect(board).not.toEqual(expect.arrayContaining(['Queue', 'Export']))
    expect(await labels('admin')).toEqual(expect.arrayContaining(['Export', 'Health', 'Cutover']))
  })
})
