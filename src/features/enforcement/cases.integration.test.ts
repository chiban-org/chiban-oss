import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, complaints, enforcementCases } from '@/db/schema'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordComplaint } from '@/features/enforcement/complaints'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function open(location = '14 Birch Lane') {
  const staff = await staffActor(handle.db, 'staff')
  const opened = await openCase(handle.db, staff, { locationText: location }, signal, NOW)
  if (!opened.ok) throw new Error(opened.error)
  return { staff, ...opened.value }
}

describe('enforcement cases', () => {
  it('case numbers run EC-2027-0001 then EC-2027-0002', async () => {
    const first = await open()
    const second = await open('22 Pine Road')
    expect(first.number).toBe('EC-2027-0001')
    expect(second.number).toBe('EC-2027-0002')
  })

  it('anonymous channel with a name is rejected by the check constraint', async () => {
    const attempt = handle.db.insert(complaints).values({
      number: 'CP-2027-0001',
      channel: 'anonymous_web',
      receivedOn: '2027-03-02',
      locationText: 'Birch Lane',
      descriptionOriginal: 'Junk in the yard',
      complainantName: 'Pat Neighbor',
    })
    await expect(attempt).rejects.toThrow()
  })

  it('anonymous channel with a creator is rejected by the check constraint', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const attempt = handle.db.insert(complaints).values({
      number: 'CP-2027-0001',
      channel: 'anonymous_web',
      receivedOn: '2027-03-02',
      locationText: 'Birch Lane',
      descriptionOriginal: 'Junk in the yard',
      createdBy: staff.userId,
    })
    await expect(attempt).rejects.toThrow()
  })

  it('transition from intake to order_issued is invalid_transition', async () => {
    const { staff, caseId } = await open()
    const result = await setCaseStatus(
      handle.db,
      staff,
      { caseId, to: 'order_issued', expectedRowVersion: 1 },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'invalid_transition' })
  })

  it('walks intake to closed through the allowed transitions', async () => {
    const { staff, caseId } = await open()
    let version = 1
    for (const to of ['investigating', 'no_violation', 'closed'] as const) {
      const moved = await setCaseStatus(
        handle.db,
        staff,
        { caseId, to, expectedRowVersion: version, reason: 'Nothing found' },
        signal,
        NOW,
      )
      if (!moved.ok) throw new Error(JSON.stringify(moved.error))
      version = moved.value.rowVersion
    }
    const [row] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    expect(row).toMatchObject({ status: 'closed', closedOn: '2027-03-02' })
  })

  it('a stale row version is stale_version', async () => {
    const { staff, caseId } = await open()
    const result = await setCaseStatus(
      handle.db,
      staff,
      { caseId, to: 'investigating', expectedRowVersion: 7 },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'stale_version' })
  })

  it('an applicant cannot open a case', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    expect(await openCase(handle.db, applicant, { locationText: 'x' }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('a reviewer cannot change case status', async () => {
    const { caseId } = await open()
    const reviewer = await staffActor(handle.db, 'reviewer')
    expect(
      await setCaseStatus(
        handle.db,
        reviewer,
        { caseId, to: 'investigating', expectedRowVersion: 1 },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('named public complaint stores contact fields visible to staff only', async () => {
    const result = await recordComplaint(
      handle.db,
      null,
      {
        channel: 'public_named',
        locationText: '14 Birch Lane',
        description: 'Unpermitted shed',
        name: 'Pat Neighbor',
        email: 'pat@example.test',
        phone: '603-555-0100',
      },
      signal,
      NOW,
    )
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    const [row] = await handle.db
      .select()
      .from(complaints)
      .where(eq(complaints.id, result.value.complaintId))
    expect(row).toMatchObject({
      channel: 'public_named',
      complainantName: 'Pat Neighbor',
      complainantEmail: 'pat@example.test',
      createdBy: null,
    })
    expect(row?.caseId).not.toBeNull()
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, result.value.complaintId))
    expect(JSON.stringify(audit)).not.toContain('pat@example.test')
  })

  it('staff entered complaints record the staff member', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const result = await recordComplaint(
      handle.db,
      staff,
      { channel: 'staff_entry', locationText: 'Route 9 gravel pit', description: 'Phone call' },
      signal,
      NOW,
    )
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    const [row] = await handle.db
      .select()
      .from(complaints)
      .where(eq(complaints.id, result.value.complaintId))
    expect(row?.createdBy).toBe(staff.userId)
  })

  it('a staff entered complaint from someone without the capability is forbidden', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    expect(
      await recordComplaint(
        handle.db,
        applicant,
        { channel: 'staff_entry', locationText: 'x', description: 'y' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an over-long description is invalid', async () => {
    const result = await recordComplaint(
      handle.db,
      null,
      { channel: 'public_named', locationText: 'x', description: 'a'.repeat(5001) },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'invalid' })
  })
})
