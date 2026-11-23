import { ME_PACK } from '@packs/me'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActivePackForTest } from '@/features/packs/registry'
import { logRequest } from '@/features/rtk/requests'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2026-07-14T15:00:00Z')
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
  setActivePackForTest(null)
})

async function loggedNumber(): Promise<string> {
  const staff = await staffActor(handle.db, 'records_custodian')
  const logged = await logRequest(
    handle.db,
    staff,
    {
      receivedOn: '2026-07-02',
      receivedVia: 'email',
      description: 'Minutes of the Alder Pond harbor committee',
    },
    signal,
    NOW,
  )
  if (!logged.ok) throw new Error(logged.error)
  return logged.value.number
}

describe('the records request number prefix', () => {
  it('comes from the Maine pack', async () => {
    setActivePackForTest(ME_PACK)
    expect(await loggedNumber()).toBe('FOAA-2026-0001')
    expect(await loggedNumber()).toBe('FOAA-2026-0002')
  })

  it('stays RK under New Hampshire', async () => {
    expect(await loggedNumber()).toBe('RK-2026-0001')
  })
})
