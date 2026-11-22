import { ME_PACK } from '@packs/me'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { setActivePackForTest } from '@/features/packs/registry'
import { loadPortalRecordsRequests } from '@/features/portal/recordsRequests'
import { closeRequest, logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let custodian: Actor
let resident: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  const id = await makeUser(handle.db, { role: 'applicant', email: 'wren.halloway@example.test' })
  resident = { userId: id, kind: 'public', roles: ['applicant'] }
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function logged(contact: string, description: string) {
  const made = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: '2027-07-12',
      receivedVia: 'email',
      requesterName: 'Wren Halloway',
      requesterContact: contact,
      description,
    },
    signal,
    NOW,
  )
  if (!made.ok) throw new Error(made.error)
  return made.value
}

describe('records requests in the portal', () => {
  it('lists a request logged with the account email, with its status and dates', async () => {
    const mine = await logged('Wren.Halloway@Example.test, 207-555-0110', 'Barn permit letters')
    const rows = await loadPortalRecordsRequests(handle.db, resident, signal)
    expect(rows).toEqual([
      {
        number: mine.number,
        receivedOn: '2027-07-12',
        status: 'Open',
        due: { label: 'Response due', on: mine.due },
        endedOn: null,
      },
    ])
  })

  it("leaves out another person's request", async () => {
    await logged('juniper.oake@example.test', 'Septic plans for 4 Fernhollow Road')
    expect(await loadPortalRecordsRequests(handle.db, resident, signal)).toEqual([])
  })

  it('never lists a request a staff member logged for someone else', async () => {
    await logged('juniper.oake@example.test', 'Culvert plans for 9 Alder Pond Road')
    expect(await loadPortalRecordsRequests(handle.db, custodian, signal)).toEqual([])
  })

  it('never lists a request a staff member keyed in as received online for someone else', async () => {
    const made = await logRequest(
      handle.db,
      custodian,
      {
        receivedOn: '2027-07-12',
        receivedVia: 'portal',
        requesterName: 'Juniper Oake',
        requesterContact: 'juniper.oake@example.test',
        description: 'Road opening permits for Vellmora Lane',
      },
      signal,
      NOW,
    )
    if (!made.ok) throw new Error(made.error)
    expect(await loadPortalRecordsRequests(handle.db, custodian, signal)).toEqual([])
  })

  it('gives the date a request was closed', async () => {
    const mine = await logged('wren.halloway@example.test', 'Barn permit letters')
    const closed = await closeRequest(
      handle.db,
      custodian,
      { requestId: mine.requestId, to: 'closed', expectedRowVersion: 1 },
      signal,
      NOW,
    )
    if (!closed.ok) throw new Error(closed.error)
    const [row] = await loadPortalRecordsRequests(handle.db, resident, signal)
    expect(row).toMatchObject({ status: 'Closed', due: null })
    expect(row?.endedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('a Maine records request in the portal', () => {
  async function respond(requestId: string, response: 'acknowledged' | 'time_statement') {
    const store = (await makeTestStore()).store
    const done = await recordFirstResponse(
      handle.db,
      store,
      custodian,
      response === 'acknowledged'
        ? { requestId, kind: 'acknowledged', respondedOn: '2027-07-13' }
        : {
            requestId,
            kind: 'time_statement',
            respondedOn: '2027-07-13',
            timeStatement: {
              statedDate: '2027-08-02',
              delayReason: 'The deeds are in the Vellmora county archive.',
              costEstimate: [],
            },
          },
      signal,
      NOW,
    )
    if (!done.ok) throw new Error(done.error)
  }

  it('calls the date of an open request the acknowledgement date', async () => {
    setActivePackForTest(ME_PACK)
    const mine = await logged('wren.halloway@example.test', 'Shoreland permits on Fernhollow Pond')
    const [row] = await loadPortalRecordsRequests(handle.db, resident, signal)
    expect(row?.due).toEqual({ label: 'Acknowledgement due', on: mine.due })
  })

  it('shows no due date once the town acknowledges the request', async () => {
    setActivePackForTest(ME_PACK)
    const mine = await logged('wren.halloway@example.test', 'Shoreland permits on Fernhollow Pond')
    await respond(mine.requestId, 'acknowledged')
    const [row] = await loadPortalRecordsRequests(handle.db, resident, signal)
    expect(row).toMatchObject({ status: 'Acknowledged', due: null })
  })

  it('shows the estimated date once the town sends a time estimate', async () => {
    setActivePackForTest(ME_PACK)
    const mine = await logged('wren.halloway@example.test', 'Shoreland permits on Fernhollow Pond')
    await respond(mine.requestId, 'time_statement')
    const [row] = await loadPortalRecordsRequests(handle.db, resident, signal)
    expect(row?.due).toEqual({ label: 'Response due', on: '2027-08-02' })
  })
})
