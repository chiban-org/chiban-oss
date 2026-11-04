import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, inspections } from '@/db/schema'
import { issueCertificateOfOccupancy } from '@/features/certificates/issueCertificate'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import type { ObjectStore } from '@/features/storage/objectStore'
import { CERTIFICATE_SOURCE } from '@/features/templates/preview/extraSources'
import { renderDocument } from '@/features/templates/templateBlocks'
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
import { makeTestStore } from '@/test/minio'
import { downloadObject } from '@/test/objectBytes'
import { staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import { publishWordingTemplate, TOWN_WORDING } from '@/test/wordingTemplate'

const signal = new AbortController().signal
const deps = { now: RESULT_NOW }
let handle: TestDb
let w: InspectionWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function issuedCertificate() {
  const permit = await newIssuedPermit(handle.db, w, 'BP')
  const finalId = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'final')
  const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, finalId))
  const recorded = await recordInspectionResult(
    handle.db,
    w.inspector,
    {
      inspectionId: finalId,
      result: 'passed',
      notes: 'Passed',
      items: await passingItems(handle.db, permit.applicationId, 'final'),
      expectedRowVersion: row?.rowVersion ?? 1,
    },
    signal,
    deps,
  )
  if (!recorded.ok) throw new Error(JSON.stringify(recorded.error))
  const [app] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, permit.applicationId))
  const issued = await issueCertificateOfOccupancy(
    handle.db,
    store,
    w.world.staff,
    {
      applicationId: permit.applicationId,
      issuedOn: civil('2027-07-07'),
      expectedRowVersion: app?.rowVersion ?? 1,
    },
    signal,
    deps,
  )
  if (!issued.ok) throw new Error(JSON.stringify(issued.error))
  return { ...issued.value, applicationId: permit.applicationId }
}

describe('certificate templates', () => {
  it('a published template is used for the stored certificate', async () => {
    await publishWordingTemplate(handle.db, await staffActor(handle.db, 'admin'), 'certificate')
    const issued = await issuedCertificate()
    const text = await pdfText(await downloadObject(handle.db, store, issued.documentId))
    expect(text).toContain(TOWN_WORDING)
    expect(text).toContain(issued.number)
  })

  it('the preview lists the certificate and rebuilds the real document', async () => {
    const issued = await issuedCertificate()
    const scope = { db: handle.db, actor: w.world.staff, signal }
    const samples = await CERTIFICATE_SOURCE.samples(scope)
    const sample = samples.find((s) => s.label.startsWith(issued.number))
    expect(sample?.label).toBe(`${issued.number}, issued July 7, 2027`)
    const input = await CERTIFICATE_SOURCE.input(scope, sample?.id ?? '')
    if (input === null) throw new Error('no preview input')
    const rendered = await renderDocument('certificate', null, input)
    if (!rendered.ok) throw new Error('render failed')
    const real = await downloadObject(handle.db, store, issued.documentId)
    expect(await pdfText(rendered.value)).toBe(await pdfText(real))
  })
})
