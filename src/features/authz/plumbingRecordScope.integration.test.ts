import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applicationConditions } from '@/db/schema'
import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import { recordDecisionNotice } from '@/features/applications/deemedRefusal'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import type { Actor } from '@/features/auth/actor'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { renewPermit } from '@/features/building/renewal'
import { issueCertificateOfOccupancy } from '@/features/certificates/issueCertificate'
import { applyCondition, setConditionStatus } from '@/features/conditions/applicationConditions'
import { recordLicenseCheck } from '@/features/licenseChecks/recordLicenseCheck'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { issuedPlumbingPermit, PLUMBING_PACK, publishPlumbingType } from '@/test/plumbingFixtures'
import { staffWith } from '@/test/staffUsers'

const signal = new AbortController().signal
const NO_STORE = {} as ObjectStore
const FORBIDDEN = { ok: false, error: 'forbidden' }
let handle: TestDb
let w: InspectionWorld
let plumber: Actor
let staff: Actor
let permitId: string
let buildingId: string

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  setActivePackForTest(PLUMBING_PACK)
  await publishPlumbingType(handle.db, w)
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
  staff = w.world.staff
  permitId = (await issuedPlumbingPermit(handle.db, w)).applicationId
  buildingId = w.building.applicationId
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

type Attempt = (actor: Actor, applicationId: string) => Promise<unknown>

const ATTEMPTS: Record<string, Attempt> = {
  'the certificate of occupancy': (actor, applicationId) =>
    issueCertificateOfOccupancy(
      handle.db,
      NO_STORE,
      actor,
      { applicationId, issuedOn: civil('2027-07-01'), expectedRowVersion: 1 },
      signal,
      { now: INSPECTION_NOW },
    ),
  'the code edition': (actor, applicationId) =>
    recordCodeEdition(handle.db, actor, { applicationId }, signal),
  'a renewal': (actor, applicationId) =>
    renewPermit(handle.db, actor, { applicationId, renewedOn: civil('2027-07-01') }, signal),
  'the written decision notice': (actor, applicationId) =>
    recordDecisionNotice(
      handle.db,
      actor,
      {
        applicationId,
        documentId: '00000000-0000-4000-8000-000000000000',
        mailedOn: civil('2027-07-01'),
      },
      signal,
      INSPECTION_NOW,
    ),
  'a license check': (actor, applicationId) =>
    recordLicenseCheck(
      handle.db,
      actor,
      {
        applicationId,
        licenseNumber: 'PL-1',
        licenseType: 'plumber',
        result: 'active',
        note: null,
      },
      signal,
    ),
  'a condition': (actor, applicationId) =>
    applyCondition(handle.db, actor, { applicationId, code: 'SEPTIC' }, signal),
}

describe('application steps that issue on an owned classification', () => {
  for (const [name, attempt] of Object.entries(ATTEMPTS)) {
    it(`refuse ${name} to staff on an owned permit and to the plumbing inspector elsewhere`, async () => {
      expect(await attempt(staff, permitId)).toEqual(FORBIDDEN)
      expect(await attempt(plumber, buildingId)).toEqual(FORBIDDEN)
      expect(await attempt(plumber, permitId)).not.toEqual(FORBIDDEN)
    })
  }

  it('refuse a condition status change to staff on an owned permit', async () => {
    const [row] = await handle.db
      .insert(applicationConditions)
      .values({
        applicationId: permitId,
        code: 'SEPTIC',
        textSnapshot: 'Septic',
        blocksIssuance: false,
        changedBy: staff.userId,
      })
      .returning({ id: applicationConditions.id })
    const conditionId = row?.id ?? ''
    expect(
      await setConditionStatus(handle.db, staff, { conditionId, status: 'met' }, signal),
    ).toEqual(FORBIDDEN)
    expect(
      await setConditionStatus(handle.db, plumber, { conditionId, status: 'met' }, signal),
    ).toEqual({ ok: true, value: undefined })
  })

  it('scope the issue affordance on the staff view', async () => {
    const view = (actor: Actor, id: string) =>
      getStaffApplicationView(handle.db, actor, id, INSPECTION_NOW, signal)
    expect((await view(staff, permitId))?.permissions.canIssue).toBe(false)
    expect((await view(plumber, permitId))?.permissions.canIssue).toBe(true)
    expect((await view(plumber, buildingId))?.permissions.canIssue).toBe(false)
    expect((await view(staff, buildingId))?.permissions.canIssue).toBe(true)
  })
})

describe('appeals on an owned classification', () => {
  const appeal = (actor: Actor, applicationId: string) =>
    recordAppeal(
      handle.db,
      actor,
      { applicationId, filedOn: civil('2027-06-25'), appellantName: 'Lee Abbott' },
      signal,
      { now: INSPECTION_NOW },
    )
  const resolve = (actor: Actor, applicationId: string) =>
    resolveAppeal(
      handle.db,
      actor,
      { applicationId, resolvedOn: civil('2027-06-30'), outcome: 'permit_upheld' },
      signal,
      INSPECTION_NOW,
    )

  it('may be recorded and resolved by the plumbing inspector or by staff who issue permits', async () => {
    const byPlumber = (await issuedPlumbingPermit(handle.db, w)).applicationId
    expect(await appeal(plumber, byPlumber)).toEqual({ ok: true, value: undefined })
    expect(await resolve(staff, byPlumber)).toEqual({ ok: true, value: undefined })
    const byStaff = (await issuedPlumbingPermit(handle.db, w)).applicationId
    expect(await appeal(staff, byStaff)).toEqual({ ok: true, value: undefined })
    expect(await resolve(plumber, byStaff)).toEqual({ ok: true, value: undefined })
  })

  it('are refused to the plumbing inspector on another classification', async () => {
    expect(await appeal(plumber, buildingId)).toEqual(FORBIDDEN)
    expect(await resolve(plumber, buildingId)).toEqual(FORBIDDEN)
  })

  it('show the appeal forms by the same rule on the staff view', async () => {
    const view = (actor: Actor, id: string) =>
      getStaffApplicationView(handle.db, actor, id, INSPECTION_NOW, signal)
    expect((await view(staff, permitId))?.permissions.canRecordAppeal).toBe(true)
    expect((await view(plumber, permitId))?.permissions.canRecordAppeal).toBe(true)
    expect((await view(plumber, buildingId))?.permissions.canRecordAppeal).toBe(false)
    expect((await view(staff, buildingId))?.permissions.canRecordAppeal).toBe(true)
  })
})
