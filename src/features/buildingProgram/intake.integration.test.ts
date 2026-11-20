import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApplication } from '@/features/applications/createApplication'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { listCounterTypes } from '@/features/counter/directIssueTypes'
import { type QuickIssueInput, quickIssue } from '@/features/counter/quickIssue'
import { listPortalTypes, startApplication } from '@/features/portal/drafts'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld
let existing: { applicationId: string }

const directBody = appTypeBody({
  key: 'BD',
  label: 'Building permit at the counter',
  prefix: 'BD',
  workflow: { allowsDirectIssue: true, substeps: [], closesOn: 'certificate_of_occupancy' },
})

function quickInput(): QuickIssueInput {
  return {
    parcelId: world.parcelId,
    applicationTypeKey: 'BD',
    values: { classification: 'residential' },
    contractor: { name: 'Pat Contractor' },
    payerName: 'Pat Contractor',
    payment: { method: 'cash', tenderedCents: 500000 },
  }
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  await saveAndPublish(handle.db, world.admin, 'application_type', 'BD', directBody)
  existing = await makeApplication(handle.db, world, {}, NOW)
  await saveAndPublish(handle.db, world.admin, 'building_program', 'default', {
    key: 'default',
    permitsEnabled: false,
    codeChoice: null,
    residents: null,
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('intake with building permits switched off', () => {
  it('drops building permit types from the portal list', async () => {
    const types = await listPortalTypes(handle.db, signal)
    expect(types.map((t) => t.classification)).not.toContain('nh.building_permit')
  })

  it('refuses to start a building permit', async () => {
    const lone = await staffActor(handle.db, 'applicant')
    const started = await startApplication(
      handle.db,
      lone,
      { parcelId: world.parcelId, applicationTypeKey: 'BP' },
      signal,
    )
    expect(started).toEqual({ ok: false, error: 'not_published' })
  })

  it('refuses createApplication for a building permit', async () => {
    const made = await createApplication(
      handle.db,
      world.applicant,
      { projectId: world.projectId, applicationTypeKey: 'BP' },
      signal,
    )
    expect(made).toEqual({ ok: false, error: 'not_published' })
  })

  it('drops building permit types from both counter lists', async () => {
    const lists = await listCounterTypes(handle.db, signal)
    const keys = [...lists.issueToday, ...lists.takeForReview].map((t) => t.key)
    expect(keys).not.toContain('BP')
    expect(keys).not.toContain('BD')
  })

  it('refuses a counter quick issue of a building permit type', async () => {
    const r = await quickIssue(handle.db, world.staff, quickInput(), signal, { now: NOW })
    expect(r).toEqual({ ok: false, error: 'not_published' })
  })

  it('still submits a building permit draft started before the switch', async () => {
    const done = await submitApplication(
      handle.db,
      world.applicant,
      {
        applicationId: existing.applicationId,
        values: { classification: 'residential' },
        attestation: { statementSha256: attestationHash(appTypeBody().attestationText) },
      },
      signal,
    )
    expect(done.ok && done.value).toMatchObject({ state: 'submitted' })
  })

  it('keeps existing building permits visible to staff', async () => {
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      existing.applicationId,
      NOW,
      signal,
    )
    expect(view).not.toBeNull()
  })
})
