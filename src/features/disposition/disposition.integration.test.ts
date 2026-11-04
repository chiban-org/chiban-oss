import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  dispositionBatches,
  dispositionItems,
  dispositionTombstones,
  documents,
  documentText,
  documentVersions,
  renditionApprovals,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { openPacketVersion, sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { approveDisposition, cancelDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import { downloadDocument } from '@/features/documents/download'
import { listDocuments } from '@/features/documents/listDocuments'
import { setAudiences } from '@/features/documents/publish'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { placeHold } from '@/features/records/holds'
import { retentionWorklist } from '@/features/records/worklist'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { DISPOSITION_NOW, eligibleCase } from '@/test/dispositionFixtures'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { packetMeeting } from '@/test/packetFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const AS_OF = d('2027-03-01')
let handle: TestDb
let store: ObjectStore
let staff: Actor
let custodian: Actor
let admin: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  custodian = await staffActor(handle.db, 'records_custodian')
  admin = await staffActor(handle.db, 'admin')
})
afterEach(async () => {
  await handle.drop()
})

async function proposed(actor: Actor = staff): Promise<string> {
  const r = await proposeDisposition(handle.db, actor, { asOf: AS_OF }, signal, DISPOSITION_NOW)
  if (!r.ok) throw new Error(`propose ${r.error}`)
  return r.value.batchId
}

async function approvedBatch(): Promise<string> {
  const batchId = await proposed()
  const r = await approveDisposition(handle.db, custodian, { batchId }, signal)
  if (!r.ok) throw new Error(`approve ${r.error}`)
  return batchId
}

const run = (batchId: string) => executeDisposition(handle.db, { batchId }, signal)

describe('proposing and approving', () => {
  it('staff can propose but only the records custodian can approve', async () => {
    await eligibleCase(handle.db, store, staff, 2)
    const batchId = await proposed(staff)
    expect(await approveDisposition(handle.db, staff, { batchId }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const [still] = await handle.db.select().from(dispositionBatches)
    expect(still?.status).toBe('proposed')
    expect((await approveDisposition(handle.db, custodian, { batchId }, signal)).ok).toBe(true)
    const [after] = await handle.db.select().from(dispositionBatches)
    expect(after).toMatchObject({ status: 'approved', approvedBy: custodian.userId })
    expect(after?.approvedAt).not.toBeNull()
    expect(await approveDisposition(handle.db, custodian, { batchId }, signal)).toEqual({
      ok: false,
      error: 'not_proposed',
    })
  })

  it('the custodian who proposed a batch cannot approve it; another custodian can', async () => {
    await eligibleCase(handle.db, store, staff, 1)
    const batchId = await proposed(custodian)
    expect(await approveDisposition(handle.db, custodian, { batchId }, signal)).toEqual({
      ok: false,
      error: 'own_proposal',
    })
    const [still] = await handle.db.select().from(dispositionBatches)
    expect(still?.status).toBe('proposed')
    const second = await staffActor(handle.db, 'records_custodian')
    expect(second.userId).not.toBe(custodian.userId)
    expect((await approveDisposition(handle.db, second, { batchId }, signal)).ok).toBe(true)
  })

  it('admin without disposition.approve is forbidden', async () => {
    await eligibleCase(handle.db, store, staff, 1)
    const batchId = await proposed()
    expect(await approveDisposition(handle.db, admin, { batchId }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await proposeDisposition(handle.db, admin, { asOf: AS_OF }, signal, DISPOSITION_NOW),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('permanent series never enters a batch', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      staff,
      { kind: 'parcel', id: await parcelId() },
      pdfBytes('permanent'),
      { seriesKey: 'nh.rs.driveway_permits' },
    )
    expect(up.documentId).toBeTruthy()
    expect(
      await proposeDisposition(
        handle.db,
        staff,
        { asOf: d('2099-01-01') },
        signal,
        new Date('2099-01-01T12:00:00Z'),
      ),
    ).toEqual({ ok: false, error: 'nothing_eligible' })
  })

  it('a future as-of date is refused and a record in an open batch is not proposed twice', async () => {
    await eligibleCase(handle.db, store, staff, 2)
    expect(
      await proposeDisposition(
        handle.db,
        staff,
        { asOf: d('2027-03-03') },
        signal,
        DISPOSITION_NOW,
      ),
    ).toEqual({ ok: false, error: 'future_date' })
    await proposed()
    expect(
      await proposeDisposition(handle.db, staff, { asOf: AS_OF }, signal, DISPOSITION_NOW),
    ).toEqual({
      ok: false,
      error: 'nothing_eligible',
    })
  })

  it('a cancelled batch frees its records and cannot run', async () => {
    await eligibleCase(handle.db, store, staff, 1)
    const batchId = await proposed()
    expect((await cancelDisposition(handle.db, custodian, { batchId }, signal)).ok).toBe(true)
    expect(await cancelDisposition(handle.db, custodian, { batchId }, signal)).toEqual({
      ok: false,
      error: 'not_cancellable',
    })
    expect(await run(batchId)).toEqual({ ok: false, error: 'not_approved' })
    expect(
      (await proposeDisposition(handle.db, staff, { asOf: AS_OF }, signal, DISPOSITION_NOW)).ok,
    ).toBe(true)
  })
})

async function parcelId(): Promise<string> {
  const { makeParcel } = await import('@/test/parcels')
  return await makeParcel(handle.db, [])
}

describe('executing a batch', () => {
  it('executed batch leaves a tombstone with series, basis, hashes, and approver and removes the versions', async () => {
    const made = await eligibleCase(handle.db, store, staff, 2)
    const batchId = await approvedBatch()
    const ran = await run(batchId)
    expect(ran.ok && ran.value).toMatchObject({ disposed: 2, skippedHold: 0 })
    const tombstones = await handle.db.select().from(dispositionTombstones)
    expect(tombstones).toHaveLength(2)
    const first = tombstones.find((t) => t.recordId === made.documentIds[0])
    expect(first).toMatchObject({
      recordKind: 'document',
      seriesKey: 'nh.rs.complaint_log',
      approvedBy: custodian.userId,
      proposedBy: staff.userId,
      batchId,
    })
    expect(first?.seriesCitation.label).toContain('RSA 33-A:3-a')
    expect(first?.retentionBasis).toMatchObject({
      state: 'eligible_on',
      eligibleOn: '2027-01-15',
      events: [{ kind: 'appeal_period_expired', occurredOn: '2027-01-15' }],
    })
    expect(first?.versionIds).toEqual([made.versionIds[0]])
    expect(first?.fileSha256s).toHaveLength(1)
    expect(await handle.db.select().from(documentVersions)).toEqual([])
    expect(await handle.db.select().from(documentText)).toEqual([])
    const [doc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.id, made.documentIds[0] ?? ''))
    expect(doc?.disposedAt).not.toBeNull()
    expect(doc?.disposedTombstoneId).toBe(first?.id)
    const [batch] = await handle.db.select().from(dispositionBatches)
    expect(batch?.status).toBe('executed')
    expect(batch?.executedAt).not.toBeNull()
    const items = await handle.db.select().from(dispositionItems)
    expect(items.every((i) => i.outcome === 'disposed')).toBe(true)
  })

  it('a disposed document no longer appears on the retention worklist', async () => {
    const made = await eligibleCase(handle.db, store, staff, 1)
    const worklistIds = async () =>
      (
        await retentionWorklist(
          handle.db,
          custodian,
          { asOf: AS_OF, state: 'eligible', limit: 25 },
          signal,
        )
      ).rows.map((r) => r.ref.id)
    expect(await worklistIds()).toContain(made.documentIds[0])
    await run(await approvedBatch())
    expect(await worklistIds()).not.toContain(made.documentIds[0])
  })

  it('running an executed batch again does nothing', async () => {
    await eligibleCase(handle.db, store, staff, 1)
    const batchId = await approvedBatch()
    await run(batchId)
    const again = await run(batchId)
    expect(again).toEqual({ ok: false, error: 'not_approved' })
    expect(await handle.db.select().from(dispositionTombstones)).toHaveLength(1)
  })

  it('a record that gained a hold after approval is skipped and reported, and the rest proceed', async () => {
    const made = await eligibleCase(handle.db, store, staff, 2)
    const batchId = await approvedBatch()
    const held = made.documentIds[0] ?? ''
    await placeHold(
      handle.db,
      custodian,
      { target: { kind: 'document', id: held }, reason: 'Litigation hold from counsel' },
      signal,
    )
    const ran = await run(batchId)
    expect(ran.ok && ran.value).toMatchObject({ disposed: 1, skippedHold: 1 })
    const items = await handle.db.select().from(dispositionItems)
    expect(items.find((i) => i.recordId === held)?.outcome).toBe('skipped_hold')
    expect((await handle.db.select().from(documentVersions)).map((v) => v.documentId)).toEqual([
      held,
    ])
  })

  it('disposed document answers 404 and its packet item 410', async () => {
    const made = await eligibleCase(handle.db, store, staff, 1)
    const documentId = made.documentIds[0] ?? ''
    await setAudiences(handle.db, staff, { documentId, audiences: ['board'] }, signal)
    const packet = await createPacket(
      handle.db,
      staff,
      {
        title: 'Packet',
        meetingId: await packetMeeting(handle.db, 'zba', d('2027-04-01')),
        documentIds: [documentId],
      },
      signal,
    )
    if (!packet.ok) throw new Error('packet')
    const mail = createMemoryTransport()
    await sendPacketLink(
      handle.db,
      mail,
      staff,
      { packetId: packet.value.packetId, recipientName: 'Board', recipientEmail: 'b@example.test' },
      signal,
    )
    const token = /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const versionId = made.versionIds[0] ?? ''
    expect((await openPacketVersion(handle.db, token, versionId, new Date(), signal)).ok).toBe(true)
    await run(await approvedBatch())
    expect(await downloadDocument(handle.db, store, staff, documentId, 'default', signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(await openPacketVersion(handle.db, token, versionId, new Date(), signal)).toEqual({
      ok: false,
      error: { withdrawnOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    })
    const listed = await listDocuments(
      handle.db,
      staff,
      { record: { kind: 'enforcement_case', id: made.caseId }, limit: 25 },
      signal,
    )
    expect(listed.rows).toEqual([])
  })

  it('approvals of a disposed document are deleted', async () => {
    const made = await eligibleCase(handle.db, store, staff, 1)
    await handle.db.insert(renditionApprovals).values({
      documentId: made.documentIds[0] ?? '',
      versionId: made.versionIds[0] ?? '',
      purpose: 'rtk_release',
      approvedByKind: 'system',
      reviewStatement: 'Fixture approval for a disposition test.',
    })
    await run(await approvedBatch())
    expect(await handle.db.select().from(renditionApprovals)).toEqual([])
  })
})

describe('the delete guard', () => {
  async function deleteVersionUnderSetting(versionId: string, setting: string) {
    return await handle.db.transaction(async (tx) => {
      await tx.execute(
        (await import('drizzle-orm'))
          .sql`select set_config('chiban.disposition', ${setting}, true)`,
      )
      return await tx.delete(documentVersions).where(eq(documentVersions.id, versionId))
    })
  }

  it('document version delete outside a batch still raises', async () => {
    const made = await eligibleCase(handle.db, store, staff, 1)
    await expectDbError(
      handle.db.delete(documentVersions).where(eq(documentVersions.id, made.versionIds[0] ?? '')),
      /insert-only/,
    )
  })

  it('naming an executing batch does not allow a delete without a tombstone for that record', async () => {
    const made = await eligibleCase(handle.db, store, staff, 1)
    const batchId = await approvedBatch()
    await handle.db.update(dispositionBatches).set({ status: 'executing' })
    await expectDbError(deleteVersionUnderSetting(made.versionIds[0] ?? '', batchId), /insert-only/)
  })

  it('naming an approved or unknown batch never allows a delete', async () => {
    const made = await eligibleCase(handle.db, store, staff, 1)
    const batchId = await approvedBatch()
    await expectDbError(deleteVersionUnderSetting(made.versionIds[0] ?? '', batchId), /insert-only/)
    await expectDbError(
      deleteVersionUnderSetting(made.versionIds[0] ?? '', '00000000-0000-4000-8000-000000000000'),
      /insert-only/,
    )
  })

  it('tombstones are insert-only', async () => {
    await eligibleCase(handle.db, store, staff, 1)
    await run(await approvedBatch())
    await expectDbError(handle.db.delete(dispositionTombstones), /insert-only/)
    await expectDbError(
      handle.db.update(dispositionTombstones).set({ title: 'Renamed' }),
      /insert-only/,
    )
  })
})
