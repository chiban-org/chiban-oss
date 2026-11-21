import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import { buildingGateDefinitions } from '@/features/building/gates'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { registerGate } from '@/features/gates/registry'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'
import { ME_CLASSIFICATIONS } from './classifications'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const TODAY = '2027-03-02' as CivilDate
const TYPE_KEY = 'MEBP'
const CODE_GATE = 'me.bp.code_edition_recorded'
const BUILDING_BINDINGS =
  ME_CLASSIFICATIONS.find((c) => c.key === 'me.building_permit')?.mandatoryRuleKeys ?? []
let handle: TestDb
let world: PermitWorld

function publishProgram(codeChoice: string | null, residents: number) {
  return saveAndPublish(handle.db, world.admin, 'building_program', 'default', {
    key: 'default',
    permitsEnabled: true,
    codeChoice,
    residents,
  })
}

async function submitted() {
  const app = await makeApplication(handle.db, world, {}, NOW, TYPE_KEY)
  const done = await submitApplication(
    handle.db,
    world.applicant,
    {
      applicationId: app.applicationId,
      values: { classification: 'residential' },
      attestation: { statementSha256: attestationHash(appTypeBody().attestationText) },
    },
    signal,
    NOW,
  )
  expect(done.ok).toBe(true)
  return app.applicationId
}

async function codeGate(applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('missing application')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, 'issued', TODAY, signal),
  )
  return results.find((g) => g.key === CODE_GATE)
}

async function issue(applicationId: string) {
  const [row] = await handle.db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      world.staff,
      { applicationId, to: 'issued', expectedRowVersion: row?.rowVersion ?? 0, onDate: TODAY },
      signal,
      NOW,
    ),
  )
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(ME_PACK)
  for (const gate of buildingGateDefinitions()) registerGate(gate)
  await saveAndPublish(
    handle.db,
    world.admin,
    'application_type',
    TYPE_KEY,
    appTypeBody({
      key: TYPE_KEY,
      prefix: 'MB',
      classification: 'me.building_permit',
      bindings: BUILDING_BINDINGS,
      workflow: { allowsDirectIssue: true, substeps: [], closesOn: 'certificate_of_occupancy' },
    }),
  )
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('a Maine building permit in a town that enforces no code', () => {
  it('issues without a code edition record', async () => {
    await publishProgram(null, 4000)
    const applicationId = await submitted()
    expect(await codeGate(applicationId)).toBeUndefined()
    expect(await issue(applicationId)).toMatchObject({ ok: true })
    const [row] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(row?.state).toBe('issued')
  })

  it('still asks for the code edition when the town enforces MUBEC', async () => {
    await publishProgram('me.code.mubec', 4000)
    const applicationId = await submitted()
    expect((await codeGate(applicationId))?.effective).toBe('blocked')
    const refused = await issue(applicationId)
    if (refused.ok || typeof refused.error !== 'object') throw new Error('expected a gate refusal')
    const blocked = refused.error.gateBlocked.filter((g) => g.effective === 'blocked')
    expect(blocked.map((g) => g.key)).toEqual([CODE_GATE])
  })
})
