import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { quickIssue } from '@/features/counter/quickIssue'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const TODAY = '2027-03-02' as CivilDate
const CODE_GATE = 'nh.bp.code_edition_recorded'
let handle: TestDb
let world: PermitWorld

function publishProgram(codeChoice: string | null, permitsEnabled = true) {
  return saveAndPublish(handle.db, world.admin, 'building_program', 'default', {
    key: 'default',
    permitsEnabled,
    codeChoice,
    residents: null,
  })
}

async function submit(applicationId: string) {
  const done = await submitApplication(
    handle.db,
    world.applicant,
    {
      applicationId,
      values: { classification: 'residential' },
      attestation: { statementSha256: attestationHash(appTypeBody().attestationText) },
    },
    signal,
    NOW,
  )
  expect(done.ok).toBe(true)
}

async function stored(applicationId: string) {
  const [row] = await handle.db
    .select({ applicability: applications.applicability })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.applicability
}

async function codeGate(applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('missing')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, 'issued', TODAY, signal),
  )
  return results.find((g) => g.key === CODE_GATE)
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
})
afterAll(async () => {
  await handle.drop()
})

describe('applicability snapshot', () => {
  it('captures the code choice at submission', async () => {
    await publishProgram('state_code')
    const app = await makeApplication(handle.db, world, {}, NOW)
    expect(await stored(app.applicationId)).toBeNull()
    await submit(app.applicationId)
    expect(await stored(app.applicationId)).toEqual({ codeChoice: 'state_code' })
  })

  it('keeps the code edition gate on an open application after the town drops its code', async () => {
    await publishProgram('state_code')
    const app = await makeApplication(handle.db, world, {}, NOW)
    await submit(app.applicationId)
    await publishProgram(null)
    expect((await codeGate(app.applicationId))?.effective).toBe('blocked')
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(view?.codeEditionApplies).toBe(true)
  })

  it('does not apply the code edition gate to an application submitted with no code', async () => {
    await publishProgram(null)
    const app = await makeApplication(handle.db, world, {}, NOW)
    await submit(app.applicationId)
    expect(await stored(app.applicationId)).toEqual({ codeChoice: null })
    expect(await codeGate(app.applicationId)).toBeUndefined()
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(view?.codeEditionApplies).toBe(false)
  })

  it('records null when permits are switched off', async () => {
    await publishProgram('state_code')
    const app = await makeApplication(handle.db, world, {}, NOW)
    await publishProgram('state_code', false)
    await submit(app.applicationId)
    expect(await stored(app.applicationId)).toEqual({ codeChoice: null })
  })

  it('treats a null snapshot as the current program', async () => {
    await publishProgram('state_code')
    const app = await makeApplication(handle.db, world, { state: 'submitted' }, NOW)
    expect(await stored(app.applicationId)).toBeNull()
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(view?.codeEditionApplies).toBe(true)
    await publishProgram(null)
    const after = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(after?.codeEditionApplies).toBe(false)
  })

  it('captures the code choice on a counter quick issue', async () => {
    await publishProgram('state_code')
    const r = await quickIssue(
      handle.db,
      world.staff,
      {
        parcelId: world.parcelId,
        applicationTypeKey: 'EL',
        values: { description: 'Panel upgrade', service_amps: 200 },
        contractor: { name: 'Pat Contractor' },
        license: { number: 'EL-20418', type: 'Electrician', result: 'active' },
        payerName: 'Pat Contractor',
        payment: { method: 'cash', tenderedCents: 5000 },
      },
      signal,
      { now: NOW },
    )
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(await stored(r.value.applicationId)).toEqual({ codeChoice: 'state_code' })
  })
})
