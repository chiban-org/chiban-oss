import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { loadPortalRecordsRequests } from '@/features/portal/recordsRequests'
import { closeRequest, logRequest } from '@/features/rtk/requests'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
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
        responseDueOn: mine.due,
        endedOn: null,
      },
    ])
  })

  it("leaves out another person's request", async () => {
    await logged('juniper.oake@example.test', 'Septic plans for 4 Fernhollow Road')
    expect(await loadPortalRecordsRequests(handle.db, resident, signal)).toEqual([])
  })

  it('lists a request filed while signed in, even with no email on it', async () => {
    const filed = await logged('207-555-0110', 'Minutes of the March meeting')
    await handle.db
      .update(rtkRequests)
      .set({ createdBy: resident.userId, receivedVia: 'portal' })
      .where(eq(rtkRequests.id, filed.requestId))
    const rows = await loadPortalRecordsRequests(handle.db, resident, signal)
    expect(rows.map((r) => r.number)).toEqual([filed.number])
  })

  it('never lists a request a staff member logged for someone else', async () => {
    await logged('juniper.oake@example.test', 'Culvert plans for 9 Alder Pond Road')
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
    expect(row).toMatchObject({ status: 'Closed', responseDueOn: null })
    expect(row?.endedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
