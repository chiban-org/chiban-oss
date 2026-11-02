import { ATTESTATION_TEXT } from '@packs/nh/starters/types'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { issueApplication } from '@/features/issuance/issueApplication'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    starters: ['nh.starter.street_address', 'nh.starter.alarm_registration'],
  })
})
afterEach(async () => {
  await handle.drop()
})

async function submitted(typeKey: string, values: Record<string, unknown>) {
  const made = await makeApplication(handle.db, world, {}, NOW, typeKey)
  const result = await submitApplication(
    handle.db,
    world.staff,
    {
      applicationId: made.applicationId,
      values: values as never,
      attestation: { statementSha256: attestationHash(ATTESTATION_TEXT) },
    },
    signal,
    NOW,
  )
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return made.applicationId
}

async function stateOf(applicationId: string) {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row
}

describe('closing on issuance', () => {
  it('a street address assignment closes when it is issued', async () => {
    const id = await submitted('SA', { description: 'New cottage', private_road: 'Birch Lane' })
    const store = (await makeTestStore()).store
    const issued = await issueApplication(handle.db, world.staff, { applicationId: id }, signal, {
      store,
      now: NOW,
    })
    expect(issued.ok).toBe(true)
    const row = await stateOf(id)
    expect(row?.state).toBe('closed')
    expect(row?.closureReason).toBe('issuance')
  })
})
