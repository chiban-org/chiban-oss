import { ME_PACK } from '@packs/me'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { setActivePackForTest } from '@/features/packs/registry'
import { rtkRequestFacets } from '@/features/rtk/requestList'
import { requestChipGroups } from '@/features/rtk/requestListChips'
import { readRequestsView } from '@/features/rtk/requestListParams'
import { requestStatusLabel } from '@/features/rtk/requestStatus'
import { logRequest, rtkRequestView } from '@/features/rtk/requests'
import { buildResponseLetter } from '@/features/rtk/responseLetter'
import { recordFirstResponse } from '@/features/rtk/responses'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let custodian: Actor

beforeEach(async () => {
  setActivePackForTest(ME_PACK)
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterEach(async () => {
  await handle.drop()
  setActivePackForTest(null)
})

async function statedRequest(): Promise<string> {
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: d('2027-07-02'),
      receivedVia: 'email',
      requesterName: 'Rowan Ashby',
      description: 'Minutes of the Vellmora Road drainage meetings',
    },
    signal,
    NOW,
  )
  if (!logged.ok) throw new Error(logged.error)
  const stated = await recordFirstResponse(
    handle.db,
    store,
    custodian,
    {
      requestId: logged.value.requestId,
      kind: 'time_statement',
      respondedOn: d('2027-07-08'),
      timeStatement: {
        statedDate: d('2027-07-30'),
        delayReason: 'The minutes are in the off-site archive.',
        costEstimate: [],
      },
    },
    signal,
    NOW,
  )
  if (!stated.ok) throw new Error(stated.error)
  return logged.value.requestId
}

describe('the stated date label on a time statement', () => {
  it('a Maine letter calls the stated date a good faith, nonbinding estimate', async () => {
    const requestId = await statedRequest()
    const wording = await pdfWording(
      await buildResponseLetter(handle.db, requestId, signal, { now: NOW }),
    )
    expect(wording).toContain(
      'Estimated response date (a good faith, nonbinding estimate)\nJuly 30, 2027',
    )
    expect(wording).not.toContain('Response by')
  })

  it('a New Hampshire letter keeps Response by', async () => {
    setActivePackForTest(null)
    const requestId = await statedRequest()
    const wording = await pdfWording(
      await buildResponseLetter(handle.db, requestId, signal, { now: NOW }),
    )
    expect(wording).toContain('The town needs more time to respond to your request.')
    expect(wording).toContain('Response by\nJuly 30, 2027')
    expect(wording).not.toContain('nonbinding')
  })

  describe('the status chip while the town works to its date', () => {
    const ESTIMATED = "Waiting for the town's estimated date"

    async function shownStatus(): Promise<{ chip: string; filters: string[] }> {
      const requestId = await statedRequest()
      const view = await rtkRequestView(handle.db, custodian, requestId, d('2027-07-14'), signal)
      if (!view.ok) throw new Error(view.error)
      const facets = await rtkRequestFacets(
        handle.db,
        custodian,
        { filters: {}, today: d('2027-07-14') },
        signal,
      )
      const status = requestChipGroups(readRequestsView({}).params, facets).find(
        (g) => g.label === 'Status',
      )
      return {
        chip: requestStatusLabel(view.value),
        filters: status?.chips.map((c) => c.label) ?? [],
      }
    }

    it('reads as an estimate under Maine', async () => {
      const shown = await shownStatus()
      expect(shown.chip).toBe(ESTIMATED)
      expect(shown.filters).toContain(ESTIMATED)
      expect(shown.filters).not.toContain('Waiting for the date the town stated')
    })

    it('reads the same under New Hampshire', async () => {
      setActivePackForTest(null)
      const shown = await shownStatus()
      expect(shown.chip).toBe(ESTIMATED)
      expect(shown.filters).toContain(ESTIMATED)
    })
  })
})
