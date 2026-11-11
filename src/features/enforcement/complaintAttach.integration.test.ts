import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, complaints, documents, enforcementCases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { setCaseStatus } from '@/features/enforcement/cases'
import { attachComplaint } from '@/features/enforcement/complaintAttach'
import { attachableComplaints } from '@/features/enforcement/complaintCandidates'
import { recordComplaint } from '@/features/enforcement/complaints'
import { addNote } from '@/features/enforcement/notes'
import { publishCase } from '@/features/enforcement/publicText'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = new Date().toISOString().slice(0, 10) as CivilDate
let handle: TestDb
let store: ObjectStore
let staff: Actor
let parcelId: string

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  store = (await makeTestStore()).store
  staff = await staffActor(handle.db, 'staff')
  parcelId = await makeParcel(handle.db, [])
})
afterEach(async () => {
  await handle.drop()
})

async function complaint(
  locationText: string,
  options: { parcel?: boolean; photo?: boolean } = {},
) {
  const made = await recordComplaint(
    handle.db,
    staff,
    {
      channel: 'staff_entry',
      locationText,
      description: 'A trailer is parked on the lot.',
      name: 'Pat Neighbor',
      ...(options.parcel === true ? { parcelId } : {}),
    },
    signal,
    new Date(),
    options.photo === true
      ? { store, photos: [{ bytes: new Uint8Array([137, 80, 78, 71]), type: 'image/png' }] }
      : undefined,
  )
  if (!made.ok) throw new Error(made.error)
  return made.value
}

async function workedCase() {
  const first = await complaint('9 Loon Point Road', { parcel: true })
  const moved = await setCaseStatus(
    handle.db,
    staff,
    { caseId: first.caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  if (!moved.ok) throw new Error(moved.error)
  return first.caseId
}

async function caseRow(caseId: string) {
  const [row] = await handle.db
    .select()
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
  return row
}

describe('attaching a complaint to an existing case', () => {
  it('moves a complaint from its untouched case and closes that case', async () => {
    const caseId = await workedCase()
    const second = await complaint('9 Loon Point Rd', { photo: true })
    const result = await attachComplaint(
      handle.db,
      staff,
      { caseId, complaintId: second.complaintId },
      signal,
    )
    const target = await caseRow(caseId)
    const shell = await caseRow(second.caseId)
    expect(result).toEqual({
      ok: true,
      value: { complaintNumber: second.number, closedCaseNumber: shell?.number },
    })
    const [moved] = await handle.db
      .select()
      .from(complaints)
      .where(eq(complaints.id, second.complaintId))
    expect(moved?.caseId).toBe(caseId)
    expect(shell?.status).toBe('closed')
    expect(shell?.closureReason).toBe(
      `Complaint ${second.number} was moved to case ${target?.number}.`,
    )
    const photos = await handle.db
      .select()
      .from(documents)
      .where(and(eq(documents.recordId, caseId), eq(documents.docKind, 'enforcement_photo')))
    expect(photos).toHaveLength(1)
    const titles = async (id: string) => {
      const detail = await loadCaseDetail(handle.db, staff, id, TODAY, signal)
      if (!detail.ok) throw new Error(detail.error)
      return detail.value.documents.map((d) => d.title)
    }
    expect(await titles(caseId)).toContain('Complaint photo 1')
    expect(await titles(second.caseId)).not.toContain('Complaint photo 1')
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.action, 'enforcement.complaint_attached'), eq(auditLog.entityId, caseId)),
      )
    expect(audits).toHaveLength(1)
  })

  it('lists untouched complaints, same parcel first, and drops them once attached', async () => {
    const caseId = await workedCase()
    const elsewhere = await complaint('3 Mill Brook Lane')
    const here = await complaint('9 Loon Point Road, rear lot', { parcel: true })
    const listed = await attachableComplaints(handle.db, { caseId, parcelId })
    expect(listed.map((c) => [c.id, c.sameParcel])).toEqual([
      [here.complaintId, true],
      [elsewhere.complaintId, false],
    ])
    await attachComplaint(handle.db, staff, { caseId, complaintId: here.complaintId }, signal)
    const after = await attachableComplaints(handle.db, { caseId, parcelId })
    expect(after.map((c) => c.id)).toEqual([elsewhere.complaintId])
  })

  it('refuses a complaint whose own case already has work on it', async () => {
    const caseId = await workedCase()
    const other = await complaint('3 Mill Brook Lane')
    const noted = await addNote(
      handle.db,
      staff,
      { caseId: other.caseId, observedOn: '2027-03-01', body: 'Drove by.' },
      signal,
    )
    if (!noted.ok) throw new Error(noted.error)
    expect(await attachableComplaints(handle.db, { caseId, parcelId })).toEqual([])
    expect(
      await attachComplaint(handle.db, staff, { caseId, complaintId: other.complaintId }, signal),
    ).toEqual({ ok: false, error: 'complaint_case_in_progress' })
  })

  it('refuses a closed case and a complaint already on the case', async () => {
    const caseId = await workedCase()
    const [own] = await handle.db.select().from(complaints).where(eq(complaints.caseId, caseId))
    expect(
      await attachComplaint(handle.db, staff, { caseId, complaintId: own?.id ?? '' }, signal),
    ).toEqual({ ok: false, error: 'already_on_case' })
    const other = await complaint('3 Mill Brook Lane')
    await handle.db
      .update(enforcementCases)
      .set({ status: 'closed', closureReason: 'Done' })
      .where(eq(enforcementCases.id, caseId))
    expect(
      await attachComplaint(handle.db, staff, { caseId, complaintId: other.complaintId }, signal),
    ).toEqual({ ok: false, error: 'case_not_open' })
  })

  it('refuses staff without enforcement.manage', async () => {
    const caseId = await workedCase()
    const other = await complaint('3 Mill Brook Lane')
    const finance = await staffActor(handle.db, 'finance')
    expect(
      await attachComplaint(handle.db, finance, { caseId, complaintId: other.complaintId }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('needs the public text first when the case is on the public site', async () => {
    const caseId = await workedCase()
    await handle.db
      .update(complaints)
      .set({ descriptionPublic: 'A trailer is parked on the lot.' })
      .where(eq(complaints.caseId, caseId))
    const published = await publishCase(handle.db, staff, { caseId, summary: 'Open.' }, signal)
    if (!published.ok) throw new Error(published.error)
    const other = await complaint('3 Mill Brook Lane')
    expect(
      await attachComplaint(handle.db, staff, { caseId, complaintId: other.complaintId }, signal),
    ).toEqual({ ok: false, error: 'public_text_required' })
  })

  it('does not offer a complaint whose own case is on the public site', async () => {
    const caseId = await workedCase()
    const other = await complaint('3 Mill Brook Lane')
    await handle.db
      .update(enforcementCases)
      .set({ isPublic: true, publicSummary: 'Open.' })
      .where(eq(enforcementCases.id, other.caseId))
    expect(await attachableComplaints(handle.db, { caseId, parcelId })).toEqual([])
  })
})
