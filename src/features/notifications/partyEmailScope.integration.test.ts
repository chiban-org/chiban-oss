import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cutoverRows, notificationOutbox, projectParties } from '@/db/schema'
import { quickIssue } from '@/features/counter/quickIssue'
import { INSPECTION_PARTY_ROLES, queueForParties } from '@/features/notifications/queue'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const CONTRACTOR = { name: 'Pat Contractor', email: 'pat@contractor.example' }
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
})
afterEach(async () => {
  await handle.drop()
})

async function issuedAtCounter(): Promise<string> {
  const issued = await quickIssue(
    handle.db,
    world.staff,
    {
      parcelId: world.parcelId,
      applicationTypeKey: 'EL',
      values: { description: 'Panel upgrade', service_amps: 200 },
      contractor: CONTRACTOR,
      license: { number: 'EL-20418', type: 'Electrician', result: 'active' },
      payerName: CONTRACTOR.name,
      payment: { method: 'cash', tenderedCents: 5000 },
    },
    signal,
    { now: NOW },
  )
  if (!issued.ok) throw new Error('issue failed')
  return issued.value.applicationId
}

async function queueInspection(applicationId: string) {
  await handle.db.transaction((tx) =>
    queueForParties(
      tx,
      { event: 'inspection_scheduled', applicationId, roles: INSPECTION_PARTY_ROLES },
      signal,
    ),
  )
  return await handle.db
    .select({ party: notificationOutbox.recipientPartyId })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.applicationId, applicationId))
}

describe('who gets address-only emails', () => {
  it('sends inspection notices to a counter contractor who has no account', async () => {
    const applicationId = await issuedAtCounter()
    const [contractor] = await handle.db
      .select({ id: projectParties.id })
      .from(projectParties)
      .where(eq(projectParties.email, CONTRACTOR.email))
    expect(await queueInspection(applicationId)).toEqual([{ party: contractor?.id }])
  })

  it('leaves parties on records imported from the prior system alone', async () => {
    const applicationId = await issuedAtCounter()
    await handle.db.insert(cutoverRows).values({
      legacyNumber: 'LEGACY-1',
      applicationId,
      importedBy: world.admin.userId,
      sourceSha256: 'x',
    })
    expect(await queueInspection(applicationId)).toEqual([])
  })
})
