import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordEvents } from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { openCase } from '@/features/enforcement/cases'
import { setDocumentSeries } from '@/features/records/assignments'
import { checkDisposition } from '@/features/records/disposition'
import { placeHold } from '@/features/records/holds'
import { recordRetentionEvent } from '@/features/records/recordEvents'
import { retentionWorklist, type WorklistState } from '@/features/records/worklist'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-03-02T15:00:00Z')
const ATTESTATION = attestationHash(appTypeBody().attestationText)
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let custodian: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  custodian = await staffActor(handle.db, 'records_custodian')
  await saveAndPublish(handle.db, world.admin, 'form', 'bp-form', FORM_BODY)
})
afterEach(async () => {
  await handle.drop()
})

async function worklist(state: WorklistState, asOf: string, actor: Actor = custodian, limit = 25) {
  return await retentionWorklist(handle.db, actor, { asOf: d(asOf), state, limit }, signal)
}

async function refsOf(state: WorklistState, asOf: string): Promise<string[]> {
  return (await worklist(state, asOf)).rows.map((r) => r.ref.id)
}

async function withdrawnSnapshot(onDate: string): Promise<string> {
  const app = await makeApplication(handle.db, world)
  const submitted = await submitApplication(
    handle.db,
    world.applicant,
    {
      applicationId: app.applicationId,
      values: { classification: 'residential' },
      attestation: { statementSha256: ATTESTATION },
    },
    signal,
    NOW,
    store,
  )
  if (!submitted.ok) throw new Error(`submit ${JSON.stringify(submitted.error)}`)
  const moved = await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      world.applicant,
      {
        applicationId: app.applicationId,
        to: 'withdrawn',
        expectedRowVersion: 2,
        onDate: d(onDate),
      },
      signal,
    ),
  )
  if (!moved.ok) throw new Error(`withdraw ${JSON.stringify(moved.error)}`)
  const { applicationSnapshots } = await import('@/db/schema')
  const { eq } = await import('drizzle-orm')
  const [snap] = await handle.db
    .select()
    .from(applicationSnapshots)
    .where(eq(applicationSnapshots.applicationId, app.applicationId))
  return snap?.id ?? ''
}

async function caseDocument(): Promise<{ caseId: string; documentId: string }> {
  const opened = await openCase(
    handle.db,
    world.staff,
    { locationText: '14 Birch Lane' },
    signal,
    NOW,
  )
  if (!opened.ok) throw new Error('case')
  const up = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'enforcement_case', id: opened.value.caseId },
    pdfBytes('complaint photo'),
    { docKind: 'enforcement_photo', title: 'Complaint photo' },
  )
  return { caseId: opened.value.caseId, documentId: up.documentId }
}

describe('retention worklist', () => {
  it('building permit snapshot withdrawn 2027-02-01 is eligible 2028-02-01', async () => {
    const snapshotId = await withdrawnSnapshot('2027-02-01')
    expect(await refsOf('eligible', '2028-01-31')).not.toContain(snapshotId)
    const eligible = await worklist('eligible', '2028-02-01')
    const row = eligible.rows.find((r) => r.ref.id === snapshotId)
    expect(row?.ref.kind).toBe('application_snapshot')
    expect(row?.status).toEqual({ state: 'eligible_on', date: '2028-02-01' })
    expect(row?.series.key).toBe('nh.rs.building_permits_withdrawn_denied')
    expect(row?.series.citation.label).toContain('RSA 33-A:3-a')
    expect(row?.holds).toBe(0)
  })

  it('driveway permit stays permanent', async () => {
    const app = await makeApplication(handle.db, world)
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      { kind: 'application', id: app.applicationId },
      pdfBytes('driveway'),
    )
    await setDocumentSeries(
      handle.db,
      world.staff,
      { documentId: up.documentId, seriesKey: 'nh.rs.driveway_permits' },
      signal,
    )
    for (const state of ['eligible', 'awaiting_event', 'on_hold'] as const) {
      expect(await refsOf(state, '2090-01-01')).not.toContain(up.documentId)
    }
    expect(
      await checkDisposition(
        handle.db,
        { kind: 'document', id: up.documentId },
        d('2090-01-01'),
        signal,
      ),
    ).toEqual({ ok: false, error: 'permanent' })
  })

  it('complaint document waits for appeal_period_expired, then is eligible the same day', async () => {
    const { caseId, documentId } = await caseDocument()
    expect(await refsOf('awaiting_event', '2027-03-01')).toContain(documentId)
    expect(await refsOf('eligible', '2090-01-01')).not.toContain(documentId)
    const recorded = await recordRetentionEvent(
      handle.db,
      world.staff,
      { target: { caseId }, kind: 'appeal_period_expired', occurredOn: d('2027-03-01') },
      signal,
      NOW,
    )
    expect(recorded.ok).toBe(true)
    expect(await refsOf('awaiting_event', '2027-03-01')).not.toContain(documentId)
    expect(await refsOf('eligible', '2027-02-28')).not.toContain(documentId)
    expect(await refsOf('eligible', '2027-03-01')).toContain(documentId)
  })

  it('registration expired 2028-04-30 is eligible 2029-04-30', async () => {
    const app = await makeApplication(handle.db, world)
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      { kind: 'application', id: app.applicationId },
      pdfBytes('registration'),
    )
    await setDocumentSeries(
      handle.db,
      world.staff,
      { documentId: up.documentId, seriesKey: 'nh.rs.licenses_other' },
      signal,
    )
    await handle.db.insert(recordEvents).values({
      projectId: world.projectId,
      applicationId: app.applicationId,
      kind: 'registration_expired',
      occurredOn: '2028-04-30',
      recordedByKind: 'system',
    })
    expect(await refsOf('eligible', '2029-04-29')).not.toContain(up.documentId)
    const row = (await worklist('eligible', '2029-04-30')).rows.find(
      (r) => r.ref.id === up.documentId,
    )
    expect(row?.status).toEqual({ state: 'eligible_on', date: '2029-04-30' })
  })

  it('hold on an enforcement case covers its documents', async () => {
    const { caseId, documentId } = await caseDocument()
    await recordRetentionEvent(
      handle.db,
      world.staff,
      { target: { caseId }, kind: 'appeal_period_expired', occurredOn: d('2027-03-01') },
      signal,
      NOW,
    )
    const ref = { kind: 'document' as const, id: documentId }
    expect((await checkDisposition(handle.db, ref, d('2027-03-02'), signal)).ok).toBe(true)
    const held = await placeHold(
      handle.db,
      custodian,
      {
        target: { kind: 'enforcement_case', id: caseId },
        reason: 'Court has the case under review',
      },
      signal,
    )
    expect(held.ok).toBe(true)
    expect(await checkDisposition(handle.db, ref, d('2027-03-02'), signal)).toEqual({
      ok: false,
      error: 'on_hold',
    })
    expect(await refsOf('eligible', '2027-03-02')).not.toContain(documentId)
    const onHold = await worklist('on_hold', '2027-03-02')
    expect(onHold.rows.find((r) => r.ref.id === documentId)?.holds).toBe(1)
  })

  it('appeal_period_expired on a project is kind_not_for_target', async () => {
    expect(
      await recordRetentionEvent(
        handle.db,
        world.staff,
        {
          target: { projectId: world.projectId },
          kind: 'appeal_period_expired',
          occurredOn: d('2027-03-01'),
        },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'kind_not_for_target' })
  })

  it('building_removed on a case is kind_not_for_target and a future date is future_date', async () => {
    const { caseId } = await caseDocument()
    expect(
      await recordRetentionEvent(
        handle.db,
        world.staff,
        { target: { caseId }, kind: 'building_removed', occurredOn: d('2027-03-01') },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'kind_not_for_target' })
    expect(
      await recordRetentionEvent(
        handle.db,
        world.staff,
        { target: { caseId }, kind: 'appeal_period_expired', occurredOn: d('2027-04-01') },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'future_date' })
  })

  it('a reviewer cannot record a retention event and the worklist is empty for a reviewer', async () => {
    const { caseId } = await caseDocument()
    expect(
      await recordRetentionEvent(
        handle.db,
        world.reviewer,
        { target: { caseId }, kind: 'appeal_period_expired', occurredOn: d('2027-03-01') },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    const empty = await worklist('awaiting_event', '2027-03-01', world.reviewer)
    expect(empty).toEqual({ rows: [], nextCursor: null })
  })

  it('worklist under a cap of 25 with 40 eligible returns 25 and a cursor', async () => {
    const opened = await openCase(
      handle.db,
      world.staff,
      { locationText: 'Many Lane' },
      signal,
      NOW,
    )
    if (!opened.ok) throw new Error('case')
    for (let i = 0; i < 40; i += 1) {
      await uploadAs(
        handle.db,
        store,
        world.staff,
        { kind: 'enforcement_case', id: opened.value.caseId },
        pdfBytes(`photo ${i}`),
        { docKind: 'enforcement_photo', title: `Photo ${i}` },
      )
    }
    await recordRetentionEvent(
      handle.db,
      world.staff,
      {
        target: { caseId: opened.value.caseId },
        kind: 'appeal_period_expired',
        occurredOn: d('2027-03-01'),
      },
      signal,
      NOW,
    )
    const first = await worklist('eligible', '2027-03-02')
    expect(first.rows).toHaveLength(25)
    expect(first.nextCursor).not.toBeNull()
    const second = await retentionWorklist(
      handle.db,
      custodian,
      {
        asOf: d('2027-03-02'),
        state: 'eligible',
        limit: 25,
        cursor: first.nextCursor ?? undefined,
      },
      signal,
    )
    expect(second.rows).toHaveLength(15)
    expect(second.nextCursor).toBeNull()
    const seen = new Set([...first.rows, ...second.rows].map((r) => r.ref.id))
    expect(seen.size).toBe(40)
  })
})
