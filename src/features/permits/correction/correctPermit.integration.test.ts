import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applicationSnapshots,
  applications,
  auditLog,
  documents,
  roleCapabilities,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { groupRevisions } from '@/features/documents/revisions'
import { type CorrectionInput, correctPermit } from '@/features/permits/correction/correctPermit'
import { buildPermitPdf, buildPlacardPdf } from '@/features/permits/permitDocuments'
import { getPortalApplicationView } from '@/features/portal/portalView'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { PermitWorld } from '@/test/applicationFixtures'
import {
  CORRECTED_AT,
  closedAtIssuance,
  type IssuedPermit,
  issuedTradePermit,
} from '@/test/correctionFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { makeTestStore } from '@/test/minio'
import { downloadObject } from '@/test/objectBytes'
import { pdfText } from '@/test/pdfText'

const signal = new AbortController().signal
const MARK_1 = 'Corrected, revision 1, March 9, 2027'
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let permit: IssuedPermit

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  store = (await makeTestStore()).store
  permit = await issuedTradePermit(handle.db, world, store)
})
afterEach(async () => {
  await handle.drop()
})

function input(patch: Partial<CorrectionInput> = {}): CorrectionInput {
  return {
    applicationId: permit.trade.applicationId,
    values: { description: 'Panel upgrade', contractor_license_number: 'EL-2' },
    projectTitle: 'Garage addition',
    contractor: { kind: 'keep' },
    reason: 'License number was mistyped',
    ...patch,
  }
}

async function correct(patch: Partial<CorrectionInput> = {}, actor: Actor = world.staff) {
  return await correctPermit(handle.db, actor, input(patch), signal, { store, now: CORRECTED_AT })
}

async function application(id = permit.trade.applicationId) {
  const [row] = await handle.db.select().from(applications).where(eq(applications.id, id))
  return row
}

async function permitDocs(id = permit.trade.applicationId) {
  return await handle.db
    .select()
    .from(documents)
    .where(and(eq(documents.recordId, id), eq(documents.docKind, 'issued_permit')))
    .orderBy(documents.seq)
}

async function revoke(capability: 'permit.issue' | 'application.amend_after_review') {
  await handle.db
    .delete(roleCapabilities)
    .where(and(eq(roleCapabilities.role, 'staff'), eq(roleCapabilities.capability, capability)))
}

describe('who may correct a permit', () => {
  it('refuses staff without application.amend_after_review', async () => {
    await revoke('application.amend_after_review')
    expect(await correct()).toEqual({ ok: false, error: 'forbidden' })
  })

  it('refuses staff without permit.issue', async () => {
    await revoke('permit.issue')
    expect(await correct()).toEqual({ ok: false, error: 'forbidden' })
  })

  it('refuses a reviewer', async () => {
    expect(await correct({}, world.reviewer)).toEqual({ ok: false, error: 'forbidden' })
  })

  it('requires a reason', async () => {
    expect(await correct({ reason: '  ' })).toEqual({ ok: false, error: 'reason_required' })
  })
})

describe('a correction', () => {
  it('records a correction snapshot, an audit entry and revision 1', async () => {
    const done = await correct()
    expect(done.ok).toBe(true)
    const row = await application()
    expect(row?.permitRevision).toBe(1)
    expect(row?.permitCorrectedOn).toBe('2027-03-09')
    expect(row?.values).toMatchObject({ contractor_license_number: 'EL-2' })
    const snapshots = await handle.db
      .select()
      .from(applicationSnapshots)
      .where(eq(applicationSnapshots.applicationId, permit.trade.applicationId))
    expect(snapshots.map((s) => s.reason)).toContain('correction')
    const [entry] = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'permit.correct'))
    expect(entry?.before).toMatchObject({
      values: { contractor_license_number: 'EL-1' },
      revision: 0,
    })
    expect(entry?.after).toMatchObject({
      values: { contractor_license_number: 'EL-2' },
      revision: 1,
      reason: 'License number was mistyped',
    })
  })

  it('keeps the earlier stored permit, marked superseded by the corrected copy', async () => {
    const done = await correct()
    if (!done.ok) throw new Error(JSON.stringify(done.error))
    const [original, corrected] = await permitDocs()
    expect(corrected?.id).toBe(done.value.documentId)
    expect(original?.supersededBy).toBe(corrected?.id)
    expect(corrected?.supersededBy).toBeNull()
    expect(corrected?.title).toContain(MARK_1)
    expect(await pdfText(await downloadObject(handle.db, store, done.value.documentId))).toContain(
      MARK_1,
    )
  })

  it('shows the applicant the corrected copy with the earlier one under it', async () => {
    const done = await correct()
    if (!done.ok) throw new Error(JSON.stringify(done.error))
    const view = await getPortalApplicationView(
      handle.db,
      world.applicant,
      permit.trade.applicationId,
      signal,
    )
    if (!view.ok) throw new Error(view.error)
    const permits = groupRevisions(view.value.documents).filter(
      (g) => g.current.docKind === 'issued_permit',
    )
    expect(permits).toHaveLength(1)
    expect(permits[0]?.current.documentId).toBe(done.value.documentId)
    expect(permits[0]?.earlier).toHaveLength(1)
  })

  it('numbers later corrections 2, 3 and chains the superseded copies', async () => {
    await correct()
    const second = await correct({
      values: { description: 'Panel upgrade', contractor_license_number: 'EL-3' },
    })
    expect(second.ok && second.value.revision).toBe(2)
    const docs = await permitDocs()
    expect(docs).toHaveLength(3)
    expect(docs[0]?.supersededBy).toBe(docs[1]?.id)
    expect(docs[1]?.supersededBy).toBe(docs[2]?.id)
    expect(docs[2]?.title).toContain('Corrected, revision 2, March 9, 2027')
  })

  it('prints the permit and placard with the corrected mark', async () => {
    await correct()
    const pdf = await buildPermitPdf(handle.db, permit.trade.applicationId, signal)
    const placard = await buildPlacardPdf(handle.db, permit.trade.applicationId, signal)
    if (!pdf.ok || !placard.ok) throw new Error('not rendered')
    expect(await pdfText(pdf.value)).toContain(MARK_1)
    expect(await pdfText(placard.value)).toContain(MARK_1)
  })

  it('two corrections at once become revisions 1 and 2', async () => {
    const [a, b] = await Promise.all([
      correct(),
      correct({ values: { description: 'Panel upgrade', contractor_license_number: 'EL-9' } }),
    ])
    const revisions = [a, b].map((r) => (r.ok ? r.value.revision : 0)).sort()
    expect(revisions).toEqual([1, 2])
    expect((await application())?.permitRevision).toBe(2)
  })

  it('is allowed on a permit that closed at issuance', async () => {
    const id = await closedAtIssuance(handle.db, world, store)
    const done = await correctPermit(
      handle.db,
      world.staff,
      {
        applicationId: id,
        values: { description: 'New cottage, corrected', private_road: 'Birch Lane' },
        projectTitle: 'Garage addition',
        contractor: { kind: 'keep' },
        reason: 'Typo in the description',
      },
      signal,
      { store, now: CORRECTED_AT },
    )
    expect(done.ok && done.value.revision).toBe(1)
    const docs = await permitDocs(id)
    expect(docs[0]?.supersededBy).toBe(docs[1]?.id)
  })
})
