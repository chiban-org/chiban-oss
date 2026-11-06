import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications, certificatesOfOccupancy, documents, inspections } from '@/db/schema'
import { recordAppeal } from '@/features/appeals/appeals'
import { summarizeApplications } from '@/features/applications/recordSource'
import { issueCertificateOfOccupancy } from '@/features/certificates/issueCertificate'
import { registerGate } from '@/features/gates/registry'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  civil,
  type InspectionWorld,
  newIssuedPermit,
  passingItems,
  RESULT_NOW,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { pdfText } from '@/test/pdfText'

const signal = new AbortController().signal
const deps = { now: RESULT_NOW }
let handle: TestDb
let w: InspectionWorld
let store: ObjectStore
const blockClosing = { on: false }

registerGate({
  key: 'test.block_closing',
  kind: 'administrative',
  appliesTo: ['closed'],
  boundBy: null,
  evaluate: () =>
    Promise.resolve(
      blockClosing.on ? { status: 'blocked', reason: 'Held for test' } : { status: 'pass' },
    ),
})

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  store = (await makeTestStore()).store
})
afterAll(async () => {
  await handle.drop()
})

async function passedFinal(applicationId: string, outcome: 'passed' | 'failed' = 'passed') {
  const id = await scheduledInspection(handle.db, w.inspector, applicationId, 'final')
  const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
  const items =
    outcome === 'passed'
      ? await passingItems(handle.db, applicationId, 'final')
      : [{ itemKey: 'final-1', outcome: 'fail' as const }]
  const r = await recordInspectionResult(
    handle.db,
    w.inspector,
    {
      inspectionId: id,
      result: outcome,
      notes: 'Egress door does not latch',
      items,
      expectedRowVersion: row?.rowVersion ?? 1,
    },
    signal,
    deps,
  )
  if (!r.ok) throw new Error(`result failed ${JSON.stringify(r.error)}`)
  return id
}

async function appVersion(applicationId: string): Promise<number> {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.rowVersion ?? 0
}

async function issue(applicationId: string, actor = w.world.staff, issuedOn = '2027-07-07') {
  return await issueCertificateOfOccupancy(
    handle.db,
    store,
    actor,
    {
      applicationId,
      issuedOn: civil(issuedOn),
      expectedRowVersion: await appVersion(applicationId),
    },
    signal,
    deps,
  )
}

describe('certificate of occupancy', () => {
  it('certificate after a passed building final closes the permit and stores the pdf as a document', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    const finalId = await passedFinal(permit.applicationId)
    const r = await issue(permit.applicationId)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.number).toBe('CO-2027-0001')
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, permit.applicationId))
    expect(app).toMatchObject({ state: 'closed', closureReason: 'certificate_of_occupancy' })
    const [doc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.id, r.value.documentId))
    expect(doc).toMatchObject({
      recordKind: 'application',
      recordId: permit.applicationId,
      docKind: 'certificate_of_occupancy',
      isPublic: false,
    })
    const [cert] = await handle.db.select().from(certificatesOfOccupancy)
    expect(cert).toMatchObject({ finalInspectionId: finalId, issuedBy: w.world.staff.userId })
  })

  it('certificate number is CO-2027-0001 then CO-2027-0002', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passedFinal(permit.applicationId)
    const r = await issue(permit.applicationId)
    expect(r.ok && r.value.number).toBe('CO-2027-0002')
  })

  it('certificate pdf text contains the number and "Certificate of Occupancy"', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passedFinal(permit.applicationId)
    const r = await issue(permit.applicationId)
    if (!r.ok) throw new Error('issue failed')
    const bytes = await downloadObject(handle.db, store, r.value.documentId)
    const text = await pdfText(bytes)
    expect(text).toContain('Certificate of Occupancy')
    expect(text).toContain(r.value.number)
    expect(text).toContain(permit.number)
  })

  it('certificate with no passed final is final_not_passed', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    expect(await issue(permit.applicationId)).toEqual({ ok: false, error: 'final_not_passed' })
  })

  it('certificate when a later final failed is final_not_passed', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passedFinal(permit.applicationId, 'passed')
    await passedFinal(permit.applicationId, 'failed')
    expect(await issue(permit.applicationId)).toEqual({ ok: false, error: 'final_not_passed' })
  })

  it('certificate on a suspended permit is permit_suspended', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passedFinal(permit.applicationId)
    await recordAppeal(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        filedOn: civil('2027-07-07'),
        appellantName: 'Neighbor',
      },
      signal,
      { now: new Date('2027-12-31T17:00:00Z') },
    )
    expect(await issue(permit.applicationId)).toEqual({ ok: false, error: 'permit_suspended' })
  })

  it('certificate for a trade permit is not_a_co_type', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    expect(await issue(permit.applicationId)).toEqual({ ok: false, error: 'not_a_co_type' })
  })

  it('inspector issuing a certificate is forbidden', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passedFinal(permit.applicationId)
    expect(await issue(permit.applicationId, w.inspector)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('a date in the future is future_date and a stale version is stale_version', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passedFinal(permit.applicationId)
    expect(await issue(permit.applicationId, w.world.staff, '2027-07-20')).toEqual({
      ok: false,
      error: 'future_date',
    })
    const stale = await issueCertificateOfOccupancy(
      handle.db,
      store,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        issuedOn: civil('2027-07-07'),
        expectedRowVersion: 99,
      },
      signal,
      deps,
    )
    expect(stale).toEqual({ ok: false, error: 'stale_version' })
  })

  it('a blocked gate stores nothing', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passedFinal(permit.applicationId)
    const before = (await handle.db.select().from(certificatesOfOccupancy)).length
    const docsBefore = (await handle.db.select().from(documents)).length
    blockClosing.on = true
    const r = await issue(permit.applicationId)
    blockClosing.on = false
    expect(r.ok).toBe(false)
    expect(!r.ok && typeof r.error === 'object' && 'gateBlocked' in r.error).toBe(true)
    expect((await handle.db.select().from(certificatesOfOccupancy)).length).toBe(before)
    expect((await handle.db.select().from(documents)).length).toBe(docsBefore)
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, permit.applicationId))
    expect(app?.state).toBe('issued')
    const retry = await issue(permit.applicationId)
    expect(retry.ok && retry.value.number).toMatch(/^CO-2027-/)
  })

  it('public parcel history shows the certificate line without party names', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passedFinal(permit.applicationId)
    await issue(permit.applicationId, w.world.staff, '2027-07-07')
    const rows = await summarizeApplications(
      handle.db,
      [permit.applicationId],
      { kind: 'public' },
      signal,
    )
    expect(rows[0]?.status.label).toBe('Certificate of occupancy issued July 7, 2027')
    expect(JSON.stringify(rows)).not.toContain('Applicant')
  })
})
