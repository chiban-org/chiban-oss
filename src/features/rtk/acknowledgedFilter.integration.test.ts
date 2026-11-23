import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { setActivePackForTest } from '@/features/packs/registry'
import { listRtkRequestPage, rtkRequestFacets } from '@/features/rtk/requestList'
import { requestChipGroups } from '@/features/rtk/requestListChips'
import { readRequestsView } from '@/features/rtk/requestListParams'
import { logRequest } from '@/features/rtk/requests'
import { makeTestDb, type TestDb } from '@/test/db'
import { ACKNOWLEDGING_PACK } from '@/test/packs/acknowledgingPack'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
const TODAY = '2027-07-14' as CivilDate
let handle: TestDb
let staff: Actor
let acknowledgedOnly = ''
let answered = ''

async function log(description: string): Promise<string> {
  const result = await logRequest(
    handle.db,
    staff,
    { receivedOn: '2027-07-02', receivedVia: 'email', description },
    signal,
    NOW,
  )
  if (!result.ok) throw new Error('log failed')
  return result.value.requestId
}

beforeAll(async () => {
  setActivePackForTest(ACKNOWLEDGING_PACK)
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  await log('Alder Pond beach permits')
  acknowledgedOnly = await log('Vellmora Road minutes')
  answered = await log('Fernhollow dam reports')
  await handle.db
    .update(rtkRequests)
    .set({ status: 'responded', firstResponseKind: 'acknowledged', acknowledgedOn: '2027-07-06' })
    .where(eq(rtkRequests.id, acknowledgedOnly))
  await handle.db
    .update(rtkRequests)
    .set({
      status: 'responded',
      firstResponseKind: 'made_available',
      acknowledgedOn: '2027-07-06',
      followUpOn: '2027-07-09',
    })
    .where(eq(rtkRequests.id, answered))
})
afterAll(async () => {
  await handle.drop()
  setActivePackForTest(null)
})

const ids = async (status: string) => {
  const { filters } = readRequestsView({ status })
  const page = await listRtkRequestPage(
    handle.db,
    staff,
    { filters, limit: 25, offset: 0, today: TODAY },
    signal,
  )
  return page.rows.map((r) => r.id)
}

describe('the Acknowledged filter on the request list', () => {
  it('returns only requests with nothing but an acknowledgement', async () => {
    expect(await ids('acknowledged')).toEqual([acknowledgedOnly])
  })

  it('Responded leaves out the acknowledged-only requests', async () => {
    expect(await ids('responded')).toEqual([answered])
  })

  it('counts each one and offers the Acknowledged chip', async () => {
    const facets = await rtkRequestFacets(handle.db, staff, { filters: {}, today: TODAY }, signal)
    expect(facets.statuses.get('acknowledged')).toBe(1)
    expect(facets.statuses.get('responded')).toBe(1)
    expect(facets.statuses.get('open')).toBe(1)
    const { params } = readRequestsView({})
    const status = requestChipGroups(params, facets).find((g) => g.label === 'Status')
    const labels = status?.chips.map((c) => c.label) ?? []
    expect(labels.slice(0, 3)).toEqual(['Open', 'Acknowledged', 'Responded'])
  })

  it('a pack without acknowledgements offers no Acknowledged chip', async () => {
    setActivePackForTest(null)
    try {
      const facets = await rtkRequestFacets(handle.db, staff, { filters: {}, today: TODAY }, signal)
      const { params } = readRequestsView({})
      const status = requestChipGroups(params, facets).find((g) => g.label === 'Status')
      expect(status?.chips.map((c) => c.label)).not.toContain('Acknowledged')
      expect(facets.statuses.has('acknowledged')).toBe(false)
    } finally {
      setActivePackForTest(ACKNOWLEDGING_PACK)
    }
  })
})
