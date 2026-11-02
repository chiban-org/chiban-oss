import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requestInspection } from '@/features/inspections/requestInspection'
import { getParcelHistory } from '@/features/parcels/parcelHistory'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  checklistIdFor,
  INSPECTION_NOW,
  type InspectionWorld,
  type insertInspection,
  newIssuedPermit,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function history(viewer: Parameters<typeof getParcelHistory>[2]) {
  const h = await getParcelHistory(handle.db, w.world.parcelId, viewer, signal)
  return h.own.filter((r) => r.kind === 'inspection')
}

async function linked(patch: Parameters<typeof insertInspection>[3]) {
  const permit = await newIssuedPermit(handle.db, w, 'EL')
  const made = await requestInspection(
    handle.db,
    w.world.staff,
    {
      applicationId: permit.applicationId,
      checklistVersionId: await checklistIdFor(handle.db, permit.applicationId, 'rough'),
      channel: 'phone',
      contactName: 'Secret Contact',
      contactPhone: '603-555-0199',
    },
    signal,
    { now: INSPECTION_NOW },
  )
  if (!made.ok) throw new Error('request failed')
  const { inspections } = await import('@/db/schema')
  const { eq } = await import('drizzle-orm')
  await handle.db
    .update(inspections)
    .set(patch ?? {})
    .where(eq(inspections.id, made.value.inspectionId))
  return { permit, id: made.value.inspectionId }
}

describe('inspections in parcel history', () => {
  it('public parcel history lists inspections without notes or contact', async () => {
    await linked({
      status: 'failed',
      resultNotes: 'Private failure notes',
      resultRecordedAt: new Date('2027-07-07T15:00:00Z'),
      scheduledDate: '2027-07-07',
      startMinute: 570,
      inspectorUserId: w.inspector.userId,
    })
    const rows = await history({ kind: 'public' })
    expect(rows.map((r) => r.status.label)).toContain('Failed')
    const text = JSON.stringify(rows)
    expect(text).not.toContain('Private failure notes')
    expect(text).not.toContain('Secret Contact')
    expect(text).not.toContain('603-555-0199')
    expect(text).not.toContain(w.inspector.userId)
    expect(rows.every((r) => r.href === null)).toBe(true)
  })

  it('public sees a scheduled inspection as Scheduled but never a bare request', async () => {
    const before = (await history({ kind: 'public' })).length
    await linked({ status: 'requested' })
    expect((await history({ kind: 'public' })).length).toBe(before)
    await linked({
      status: 'scheduled',
      scheduledDate: '2027-07-12',
      startMinute: 630,
      inspectorUserId: w.inspector.userId,
    })
    const labels = (await history({ kind: 'public' })).map((r) => r.status.label)
    expect(labels).toContain('Scheduled')
  })

  it('staff see notes and every status, with a link to the inspection', async () => {
    const { id } = await linked({
      status: 'failed',
      resultNotes: 'Staff-visible failure notes',
      scheduledDate: '2027-07-07',
      startMinute: 690,
      inspectorUserId: w.inspector.userId,
    })
    const rows = await history({ kind: 'actor', actor: w.world.staff })
    const row = rows.find((r) => r.recordId === id)
    expect(row?.note).toBe('Staff-visible failure notes')
    expect(row?.href).toBe(`/staff/inspections/${id}`)
    expect(rows.some((r) => r.status.label === 'Requested')).toBe(true)
  })

  it('a party or a reviewer does not get notes in the parcel history', async () => {
    const { id } = await linked({ status: 'failed', resultNotes: 'Notes again' })
    for (const actor of [w.world.applicant, w.world.reviewer]) {
      const row = (await history({ kind: 'actor', actor })).find((r) => r.recordId === id)
      expect(row?.note ?? null).toBeNull()
    }
  })
})
