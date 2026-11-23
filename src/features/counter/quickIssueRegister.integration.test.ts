import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes, applications } from '@/db/schema'
import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import { quickIssue } from '@/features/counter/quickIssue'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
})
afterEach(async () => {
  await handle.drop()
})

async function quickIssued(): Promise<string> {
  const r = await quickIssue(
    handle.db,
    world.staff,
    {
      parcelId: world.parcelId,
      applicationTypeKey: 'EL',
      values: { description: 'Panel upgrade', service_amps: 200 },
      contractor: { name: 'Pat Contractor', email: 'pat@contractor.example' },
      license: { number: 'EL-20418', type: 'Electrician', result: 'active' },
      payerName: 'Pat Contractor',
      payment: { method: 'cash', tenderedCents: 5000 },
    },
    signal,
    { now: NOW, store: (await makeTestStore()).store },
  )
  if (!r.ok) throw new Error(JSON.stringify(r.error))
  expect(r.value.state).toBe('issued')
  return r.value.applicationId
}

async function registerEntries(applicationId: string) {
  return await handle.db
    .select({ kind: appealNodes.kind, outcome: appealNodes.outcome })
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
}

async function stateOf(applicationId: string): Promise<string | undefined> {
  const [row] = await handle.db
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.state
}

describe('the Appeals register after a counter quick issue', () => {
  it('holds exactly one entry for the quick issue', async () => {
    const applicationId = await quickIssued()
    expect(await registerEntries(applicationId)).toEqual([
      { kind: 'administrative_decision', outcome: 'approved' },
    ])
  })

  it('adds no second entry when the permit is issued again after a suspension', async () => {
    const applicationId = await quickIssued()
    const later = new Date('2027-03-20T17:00:00Z')
    const filed = await recordAppeal(
      handle.db,
      world.staff,
      { applicationId, filedOn: '2027-03-05' as CivilDate, appellantName: 'Odile Marsh' },
      signal,
      { now: later },
    )
    expect(filed).toEqual({ ok: true, value: undefined })
    expect(await stateOf(applicationId)).toBe('suspended')
    const upheld = await resolveAppeal(
      handle.db,
      world.staff,
      { applicationId, resolvedOn: '2027-03-12' as CivilDate, outcome: 'permit_upheld' },
      signal,
      later,
    )
    expect(upheld).toEqual({ ok: true, value: undefined })
    expect(await stateOf(applicationId)).toBe('issued')
    expect(await registerEntries(applicationId)).toEqual([
      { kind: 'administrative_decision', outcome: 'approved' },
    ])
  })
})
