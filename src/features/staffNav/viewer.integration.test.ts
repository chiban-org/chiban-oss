import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { settingsMenuFor } from '@/features/settingsMenu/settingsMenu'
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

type TestRole = 'finance' | 'records_custodian' | 'reviewer' | 'board_member' | 'admin'

async function viewerOf(role: TestRole) {
  const actor = await staffActor(handle.db, role)
  return await loadNavViewer(handle.db, actor, signal)
}

async function labels(role: TestRole) {
  return navItemsFor(await viewerOf(role)).map((i) => i.label)
}

async function settings(role: TestRole) {
  return settingsMenuFor(await viewerOf(role)).map((i) => i.label)
}

describe('loading the navigation viewer from stored grants', () => {
  it('derives each role menu from the stored capabilities', async () => {
    const finance = await labels('finance')
    expect(finance).toContain('Payments')
    expect(finance).not.toContain('Settings')
    const custodian = await labels('records_custodian')
    expect(custodian).toEqual(
      expect.arrayContaining(['Preservation', 'Legal holds', 'Data export']),
    )
    expect(custodian).not.toContain('Settings')
    const board = await labels('board_member')
    expect(board).not.toEqual(expect.arrayContaining(['Applications', 'Settings']))
    expect(await labels('admin')).toContain('Settings')
  })

  it('derives each role settings menu from the stored capabilities', async () => {
    expect(await settings('finance')).toEqual([])
    expect(await settings('records_custodian')).toEqual([])
    expect(await settings('admin')).toEqual(
      expect.arrayContaining(['Data export', 'Health', 'Move open applications over']),
    )
  })
})
