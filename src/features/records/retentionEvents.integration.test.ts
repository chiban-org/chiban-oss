import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, enforcementCases, inspections, recordEvents } from '@/db/schema'
import { issueCertificateOfOccupancy } from '@/features/certificates/issueCertificate'
import { startClocksFor } from '@/features/clocks/startClocks'
import { setCaseStatus } from '@/features/enforcement/cases'
import { attachComplaint } from '@/features/enforcement/complaintAttach'
import { recordComplaint } from '@/features/enforcement/complaints'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { setActivePackForTest } from '@/features/packs/registry'
import { setDocumentSeries } from '@/features/records/assignments'
import { checkDisposition } from '@/features/records/disposition'
import { retentionWorklist, type WorklistState } from '@/features/records/worklist'
import { fileRequestLetter } from '@/features/rtk/requestLetter'
import { closeRequest } from '@/features/rtk/requests'
import { expireLapsedPermits } from '@/jobs/clocksDaily'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { investigatingCase } from '@/test/enforcementActionFixtures'
import { setupEnforcementWorld } from '@/test/enforcementFixtures'
import {
  type InspectionWorld,
  newIssuedPermit,
  passingItems,
  RESULT_NOW,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { makeTestStore } from '@/test/objectStore'
import { REQUEST_LETTER_SERIES, RETENTION_EVENTS_PACK } from '@/test/packs/retentionEventsPack'
import { staffActor } from '@/test/parcels'
import { loggedRequest } from '@/test/rtkFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb

beforeAll(() => {
  setActivePackForTest(RETENTION_EVENTS_PACK)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

type EventTargetColumn =
  | typeof recordEvents.applicationId
  | typeof recordEvents.caseId
  | typeof recordEvents.rtkRequestId

async function eventsOf(column: EventTargetColumn, id: string) {
  const rows = await handle.db.select().from(recordEvents).where(eq(column, id))
  return rows.map((e) => [e.kind, e.occurredOn, e.recordedByKind])
}

describe('the permit expiry event', () => {
  it('a lapsed registration writes one permit_expired dated by the lapse, even when the job runs twice', async () => {
    const world = await setupPermitWorld(handle.db, { starters: ['nh.starter.alarm_registration'] })
    const app = await makeApplication(
      handle.db,
      world,
      { state: 'issued', issuedOn: '2027-05-01' },
      new Date('2027-03-02T15:00:00Z'),
      'AR',
    )
    await handle.db.transaction((tx) =>
      startClocksFor(tx, app.applicationId, 'permit_issued', d('2027-05-01'), signal),
    )
    await handle.db.transaction((tx) => expireLapsedPermits(tx, d('2028-05-02'), signal))
    await handle.db.transaction((tx) => expireLapsedPermits(tx, d('2028-05-03'), signal))
    const events = await eventsOf(recordEvents.applicationId, app.applicationId)
    expect(events.filter(([kind]) => kind === 'permit_expired')).toEqual([
      ['permit_expired', '2028-05-02', 'system'],
    ])
  })
})

describe('the inspection and certificate events', () => {
  let w: InspectionWorld

  beforeEach(async () => {
    w = await setupInspectionWorld(handle.db)
  })

  async function passFinal(applicationId: string) {
    const id = await scheduledInspection(handle.db, w.inspector, applicationId, 'final')
    const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
    const result = await recordInspectionResult(
      handle.db,
      w.inspector,
      {
        inspectionId: id,
        result: 'passed',
        items: await passingItems(handle.db, applicationId, 'final'),
        expectedRowVersion: row?.rowVersion ?? 1,
      },
      signal,
      { now: RESULT_NOW },
    )
    if (!result.ok) throw new Error(`final ${JSON.stringify(result.error)}`)
  }

  async function issueCertificate(applicationId: string) {
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
    return await issueCertificateOfOccupancy(
      handle.db,
      (await makeTestStore()).store,
      w.world.staff,
      { applicationId, issuedOn: d('2027-07-15'), expectedRowVersion: app?.rowVersion ?? 0 },
      signal,
      { now: new Date('2027-07-20T15:00:00Z') },
    )
  }

  it('a passed final on a trade permit writes one final_inspection_passed dated by the result', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    await passFinal(permit.applicationId)
    expect(await eventsOf(recordEvents.applicationId, permit.applicationId)).toEqual([
      ['final_inspection_passed', '2027-07-07', 'system'],
    ])
  })

  it('a second passed final on a building permit still leaves one final_inspection_passed', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passFinal(permit.applicationId)
    await passFinal(permit.applicationId)
    expect(await eventsOf(recordEvents.applicationId, permit.applicationId)).toEqual([
      ['final_inspection_passed', '2027-07-07', 'system'],
    ])
  })

  it('issuing the certificate writes one occupancy_certificate_issued dated by the certificate', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await passFinal(permit.applicationId)
    expect((await issueCertificate(permit.applicationId)).ok).toBe(true)
    expect(await issueCertificate(permit.applicationId)).toEqual({ ok: false, error: 'not_issued' })
    const events = await eventsOf(recordEvents.applicationId, permit.applicationId)
    expect(events.filter(([kind]) => kind === 'occupancy_certificate_issued')).toEqual([
      ['occupancy_certificate_issued', '2027-07-15', 'system'],
    ])
  })
})

describe('the case closed event', () => {
  it('closing an enforcement case writes one case_closed dated by the closing', async () => {
    const world = await setupEnforcementWorld(handle.db)
    const { caseId } = await investigatingCase(handle.db, world)
    const now = new Date('2027-03-10T15:00:00Z')
    const moves = [
      { to: 'no_violation' as const, expectedRowVersion: 2 },
      { to: 'closed' as const, reason: 'No violation found.', expectedRowVersion: 3 },
    ]
    for (const move of moves) {
      const moved = await setCaseStatus(handle.db, world.staff, { caseId, ...move }, signal, now)
      if (!moved.ok) throw new Error(`move ${move.to} ${moved.error}`)
    }
    const again = await setCaseStatus(
      handle.db,
      world.staff,
      { caseId, to: 'closed', reason: 'Again.', expectedRowVersion: 4 },
      signal,
      now,
    )
    expect(again.ok).toBe(false)
    expect(await eventsOf(recordEvents.caseId, caseId)).toEqual([
      ['case_closed', '2027-03-10', 'system'],
    ])
  })

  it('a complaint moved off its untouched case closes that case with one case_closed', async () => {
    const world = await setupEnforcementWorld(handle.db)
    const complaint = async (locationText: string) => {
      const made = await recordComplaint(
        handle.db,
        world.staff,
        { channel: 'staff_entry', locationText, description: 'A trailer is parked on the lot.' },
        signal,
      )
      if (!made.ok) throw new Error(made.error)
      return made.value
    }
    const kept = await complaint('9 Loon Point Road')
    const moved = await complaint('9 Loon Point Rd')
    const input = { caseId: kept.caseId, complaintId: moved.complaintId }
    expect((await attachComplaint(handle.db, world.staff, input, signal)).ok).toBe(true)
    const [shell] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, moved.caseId))
    expect(await eventsOf(recordEvents.caseId, moved.caseId)).toEqual([
      ['case_closed', shell?.closedOn, 'system'],
    ])
    expect(await eventsOf(recordEvents.caseId, kept.caseId)).toEqual([])
  })

  it('a pack whose series never start from case_closed records nothing', async () => {
    setActivePackForTest(null)
    try {
      const world = await setupEnforcementWorld(handle.db)
      const { caseId } = await investigatingCase(handle.db, world)
      for (const move of [
        { to: 'no_violation' as const, expectedRowVersion: 2 },
        { to: 'closed' as const, reason: 'No violation found.', expectedRowVersion: 3 },
      ]) {
        expect((await setCaseStatus(handle.db, world.staff, { caseId, ...move }, signal)).ok).toBe(
          true,
        )
      }
      expect(await eventsOf(recordEvents.caseId, caseId)).toEqual([])
    } finally {
      setActivePackForTest(RETENTION_EVENTS_PACK)
    }
  })
})

describe('the request completed event', () => {
  async function requestWithLetter() {
    await setupPermitWorld(handle.db)
    const custodian = await staffActor(handle.db, 'records_custodian')
    const requestId = await loggedRequest(handle.db, custodian)
    const store = (await makeTestStore()).store
    const documentId = await handle.db.transaction((tx) =>
      fileRequestLetter(
        tx,
        { store, actor: custodian, signal },
        { requestId, title: 'Response letter', filename: 'response.pdf' },
      ),
    )
    const series = await setDocumentSeries(
      handle.db,
      custodian,
      { documentId, seriesKey: REQUEST_LETTER_SERIES.key },
      signal,
    )
    if (!series.ok) throw new Error(`series ${series.error}`)
    return { custodian, requestId, documentId }
  }

  async function close(
    custodian: Awaited<ReturnType<typeof requestWithLetter>>['custodian'],
    requestId: string,
    to: 'closed' | 'withdrawn',
    expectedRowVersion: number,
  ) {
    return await closeRequest(
      handle.db,
      custodian,
      { requestId, to, expectedRowVersion },
      signal,
      new Date('2026-11-10T15:00:00Z'),
    )
  }

  it('closing the request writes one request_completed and starts the letter retention', async () => {
    const { custodian, requestId, documentId } = await requestWithLetter()
    const ids = async (state: WorklistState, asOf: string) =>
      (
        await retentionWorklist(handle.db, custodian, { asOf: d(asOf), state, limit: 50 }, signal)
      ).rows.map((r) => r.ref.id)
    expect(await ids('awaiting_event', '2026-11-09')).toContain(documentId)
    expect((await close(custodian, requestId, 'closed', 1)).ok).toBe(true)
    expect(await close(custodian, requestId, 'closed', 2)).toEqual({
      ok: false,
      error: 'already_closed',
    })
    expect(await eventsOf(recordEvents.rtkRequestId, requestId)).toEqual([
      ['request_completed', '2026-11-10', 'system'],
    ])
    expect(await ids('awaiting_event', '2027-11-09')).not.toContain(documentId)
    expect(await ids('eligible', '2027-11-09')).not.toContain(documentId)
    expect(await ids('eligible', '2027-11-10')).toContain(documentId)
    const ref = { kind: 'document' as const, id: documentId }
    expect((await checkDisposition(handle.db, ref, d('2027-11-09'), signal)).ok).toBe(false)
    expect((await checkDisposition(handle.db, ref, d('2027-11-10'), signal)).ok).toBe(true)
  })

  it('withdrawing the request writes one request_completed dated by the withdrawal', async () => {
    const { custodian, requestId } = await requestWithLetter()
    expect((await close(custodian, requestId, 'withdrawn', 1)).ok).toBe(true)
    expect(await close(custodian, requestId, 'withdrawn', 2)).toEqual({
      ok: false,
      error: 'already_closed',
    })
    expect(await eventsOf(recordEvents.rtkRequestId, requestId)).toEqual([
      ['request_completed', '2026-11-10', 'system'],
    ])
  })
})
