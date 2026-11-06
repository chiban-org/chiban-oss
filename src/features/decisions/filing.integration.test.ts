import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardDecisions, clocks, documents, regionalImpactParties } from '@/db/schema'
import { fileDecision } from '@/features/decisions/fileDecision'
import { recordRegionalTransmittal } from '@/features/decisions/regionalTransmittal'
import { listDocuments } from '@/features/documents/listDocuments'
import { resolveRendition } from '@/features/documents/visibility'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { recordProof } from '@/features/notices/proofs'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  ALDER_POND_CONTACTS,
  type BoardWorld,
  publishRegionalContacts,
  setupBoardWorld,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { proofDocument } from '@/test/noticeFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const AFTER_FILING = new Date('2027-07-20T16:00:00Z')
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function decided(options: { regional?: 'yes' | 'no'; documents?: boolean } = {}) {
  return await decidedZba(handle.db, world, store, { votedOn: '2027-07-01', ...options })
}

async function file(
  made: { applicationId: string; decisionId: string },
  filedOn: string,
  actor = world.staff,
) {
  return await fileDecision(
    handle.db,
    actor,
    {
      decisionId: made.decisionId,
      filedOn: d(filedOn),
      minutesDocumentId: await proofDocument(handle.db, world, made.applicationId),
    },
    signal,
    AFTER_FILING,
  )
}

async function clockRows(applicationId: string) {
  return await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
}

async function proveCertified(applicationId: string, ids: string[], effectiveOn: string) {
  return await recordProof(
    handle.db,
    world.staff,
    {
      itemIds: ids,
      method: 'certified_mail',
      reference: '7019 0700 0001 2345 6789',
      effectiveOn: d(effectiveOn),
      documentId: await proofDocument(handle.db, world, applicationId),
    },
    signal,
    AFTER_FILING,
  )
}

describe('fileDecision', () => {
  it('filing on 2027-07-09 after a 2027-07-01 vote is on time', async () => {
    const made = await decided()
    expect(await file(made, '2027-07-09')).toEqual({ ok: true, value: { late: false } })
    const filing = (await clockRows(made.applicationId)).find(
      (c) => c.ruleKey === 'nh.board.decision_filing',
    )
    expect(filing).toMatchObject({ status: 'met', metOn: '2027-07-09', currentDue: '2027-07-09' })
  })

  it('on-time filing opens no amendment window', async () => {
    const made = await decided()
    await file(made, '2027-07-09')
    expect(
      (await clockRows(made.applicationId)).find((c) => c.ruleKey === 'nh.appeal.amendment_window'),
    ).toBeUndefined()
  })

  it('late filing opens an amendment window due 2027-08-11', async () => {
    const made = await decided()
    expect(await file(made, '2027-07-12')).toEqual({ ok: true, value: { late: true } })
    const rows = await clockRows(made.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.appeal.amendment_window')?.currentDue).toBe(
      '2027-08-11',
    )
    expect(rows.find((c) => c.ruleKey === 'nh.board.decision_filing')?.metOn).toBe('2027-07-12')
  })

  it('filed decision and minutes are public on the record', async () => {
    const made = await decided()
    const minutesId = await proofDocument(handle.db, world, made.applicationId)
    const result = await fileDecision(
      handle.db,
      world.staff,
      { decisionId: made.decisionId, filedOn: d('2027-07-09'), minutesDocumentId: minutesId },
      signal,
      AFTER_FILING,
    )
    expect(result.ok).toBe(true)
    const [decision] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, made.decisionId))
    expect(decision).toMatchObject({ filedOn: '2027-07-09', minutesDocumentId: minutesId })
    const anonymous = await listDocuments(
      handle.db,
      null,
      { record: { kind: 'application', id: made.applicationId }, limit: 25 },
      signal,
    )
    const ids = anonymous.rows.map((r) => r.documentId)
    expect(ids).toContain(minutesId)
    expect(ids).toContain(decision?.writtenDecisionDocumentId)
    expect(ids).not.toContain(decision?.letterDocumentId)
    const minutes = await resolveRendition(handle.db, null, minutesId, signal)
    const written = await resolveRendition(
      handle.db,
      null,
      decision?.writtenDecisionDocumentId ?? '',
      signal,
    )
    expect(minutes.ok && minutes.value.role).toBe('original')
    expect(written.ok && written.value.role).toBe('original')
  })

  it('filing before the written decision exists is no_written_decision', async () => {
    const made = await decided({ documents: false })
    expect(await file(made, '2027-07-09')).toEqual({ ok: false, error: 'no_written_decision' })
  })

  it('filing twice is already_filed', async () => {
    const made = await decided()
    await file(made, '2027-07-09')
    expect(await file(made, '2027-07-10')).toEqual({ ok: false, error: 'already_filed' })
  })

  it('a filing dated before the vote is before_vote and publishes nothing', async () => {
    const made = await decided()
    expect(await file(made, '2027-06-30')).toEqual({ ok: false, error: 'before_vote' })
    const [decision] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, made.decisionId))
    expect(decision?.filedOn).toBeNull()
  })

  it('a future filing date is refused', async () => {
    const made = await decided()
    expect(await file(made, '2027-07-21')).toEqual({ ok: false, error: 'future_date' })
  })

  it('minutes from another application are refused', async () => {
    const made = await decided()
    const other = await decided()
    const result = await fileDecision(
      handle.db,
      world.staff,
      {
        decisionId: made.decisionId,
        filedOn: d('2027-07-09'),
        minutesDocumentId: await proofDocument(handle.db, world, other.applicationId),
      },
      signal,
      AFTER_FILING,
    )
    expect(result).toEqual({ ok: false, error: 'document_not_found' })
    const publicRows = await handle.db.select().from(documents).where(eq(documents.isPublic, true))
    expect(publicRows).toEqual([])
  })

  it('filing needs the authority to publish documents, not only to record board actions', async () => {
    const made = await decided()
    const minutesId = await proofDocument(handle.db, world, made.applicationId)
    const result = await fileDecision(
      handle.db,
      world.admin,
      { decisionId: made.decisionId, filedOn: d('2027-07-09'), minutesDocumentId: minutesId },
      signal,
      AFTER_FILING,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, minutesId))
    expect(doc?.isPublic).toBe(false)
    const [row] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, made.decisionId))
    expect(row?.filedOn).toBeNull()
  })

  it('a reviewer filing a decision is forbidden', async () => {
    const made = await decided()
    expect(await file(made, '2027-07-09', world.reviewer)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('regional transmittal', () => {
  async function regionalDecided() {
    await publishRegionalContacts(handle.db, world)
    const made = await decided({ regional: 'yes' })
    await handle.db.insert(regionalImpactParties).values([
      { applicationId: made.applicationId, municipalityKey: 'pine_river' },
      { applicationId: made.applicationId, municipalityKey: 'dunmore' },
    ])
    return made
  }

  it('transmittal for two municipalities and the commission needs three proofs', async () => {
    const made = await regionalDecided()
    const result = await recordRegionalTransmittal(
      handle.db,
      world.staff,
      made.decisionId,
      signal,
      AFTER_FILING,
    )
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    expect(result.value).toMatchObject({ items: 3, met: false })
    const status = await noticeStatus(handle.db, result.value.setId, signal)
    expect(status.items.map((i) => i.recipientName).sort()).toEqual([
      'Alder Valley Regional Planning Commission',
      'Town of Dunmore',
      'Town of Pine River',
    ])
    expect(
      status.items.every((i) => i.channel === 'certified_mail' && i.dueOn === '2027-07-09'),
    ).toBe(true)
  })

  it('transmittal clock is met only when all three are proved by the due date', async () => {
    const made = await regionalDecided()
    const first = await recordRegionalTransmittal(
      handle.db,
      world.staff,
      made.decisionId,
      signal,
      AFTER_FILING,
    )
    if (!first.ok) throw new Error('derive failed')
    const status = await noticeStatus(handle.db, first.value.setId, signal)
    const prove = (ids: string[], effectiveOn: string) =>
      proveCertified(made.applicationId, ids, effectiveOn)
    await prove(
      status.items.slice(0, 2).map((i) => i.itemId),
      '2027-07-07',
    )
    expect(
      await recordRegionalTransmittal(
        handle.db,
        world.staff,
        made.decisionId,
        signal,
        AFTER_FILING,
      ),
    ).toMatchObject({
      ok: true,
      value: { met: false },
    })
    let rows = await clockRows(made.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.ri.transmittal')?.status).toBe('running')
    await prove(
      status.items.slice(2).map((i) => i.itemId),
      '2027-07-08',
    )
    expect(
      await recordRegionalTransmittal(
        handle.db,
        world.staff,
        made.decisionId,
        signal,
        AFTER_FILING,
      ),
    ).toMatchObject({
      ok: true,
      value: { met: true },
    })
    rows = await clockRows(made.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.ri.transmittal')).toMatchObject({
      status: 'met',
      metOn: '2027-07-08',
    })
  })

  it('a first class mailing does not prove the transmittal', async () => {
    const made = await regionalDecided()
    const first = await recordRegionalTransmittal(
      handle.db,
      world.staff,
      made.decisionId,
      signal,
      AFTER_FILING,
    )
    if (!first.ok) throw new Error('derive failed')
    const status = await noticeStatus(handle.db, first.value.setId, signal)
    expect(
      await recordProof(
        handle.db,
        world.staff,
        {
          itemIds: status.items.map((i) => i.itemId),
          method: 'first_class_mail',
          reference: null,
          effectiveOn: d('2027-07-08'),
          documentId: await proofDocument(handle.db, world, made.applicationId),
        },
        signal,
        AFTER_FILING,
      ),
    ).toEqual({ ok: false, error: { methodNotAllowed: ['Certified mail'] } })
  })

  it('a late proof leaves the transmittal clock unmet', async () => {
    const made = await regionalDecided()
    const first = await recordRegionalTransmittal(
      handle.db,
      world.staff,
      made.decisionId,
      signal,
      AFTER_FILING,
    )
    if (!first.ok) throw new Error('derive failed')
    const status = await noticeStatus(handle.db, first.value.setId, signal)
    await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: status.items.map((i) => i.itemId),
        method: 'certified_mail',
        reference: '7019 0700 0001 2345 6789',
        effectiveOn: d('2027-07-12'),
        documentId: await proofDocument(handle.db, world, made.applicationId),
      },
      signal,
      AFTER_FILING,
    )
    expect(
      await recordRegionalTransmittal(
        handle.db,
        world.staff,
        made.decisionId,
        signal,
        AFTER_FILING,
      ),
    ).toMatchObject({
      ok: true,
      value: { met: false },
    })
  })

  it('a commission missing from the settings is contacts_missing', async () => {
    await saveAndPublish(handle.db, world.admin, 'regional_contacts', 'default', {
      ...ALDER_POND_CONTACTS,
      commission: null,
    })
    const made = await decided({ regional: 'yes' })
    await handle.db
      .insert(regionalImpactParties)
      .values({ applicationId: made.applicationId, municipalityKey: 'pine_river' })
    expect(
      await recordRegionalTransmittal(
        handle.db,
        world.staff,
        made.decisionId,
        signal,
        AFTER_FILING,
      ),
    ).toEqual({
      ok: false,
      error: 'contacts_missing',
    })
  })

  it('a selected municipality missing from the settings is contacts_missing', async () => {
    await publishRegionalContacts(handle.db, world)
    const made = await decided({ regional: 'yes' })
    await handle.db.insert(regionalImpactParties).values([
      { applicationId: made.applicationId, municipalityKey: 'pine_river' },
      { applicationId: made.applicationId, municipalityKey: 'harbor_end' },
    ])
    expect(
      await recordRegionalTransmittal(
        handle.db,
        world.staff,
        made.decisionId,
        signal,
        AFTER_FILING,
      ),
    ).toEqual({
      ok: false,
      error: 'contacts_missing',
    })
  })

  it('a late replacement proof reopens the transmittal clock', async () => {
    const made = await regionalDecided()
    const first = await recordRegionalTransmittal(
      handle.db,
      world.staff,
      made.decisionId,
      signal,
      AFTER_FILING,
    )
    if (!first.ok) throw new Error('derive failed')
    const status = await noticeStatus(handle.db, first.value.setId, signal)
    const prove = (ids: string[], effectiveOn: string) =>
      proveCertified(made.applicationId, ids, effectiveOn)
    await prove(
      status.items.map((i) => i.itemId),
      '2027-07-08',
    )
    let rows = await clockRows(made.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.ri.transmittal')?.status).toBe('met')
    await prove(
      status.items.slice(0, 1).map((i) => i.itemId),
      '2027-07-12',
    )
    rows = await clockRows(made.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.ri.transmittal')).toMatchObject({
      status: 'running',
      metOn: null,
    })
  })

  it('a decision without regional impact has no transmittal', async () => {
    const made = await decided()
    expect(
      await recordRegionalTransmittal(
        handle.db,
        world.staff,
        made.decisionId,
        signal,
        AFTER_FILING,
      ),
    ).toEqual({
      ok: false,
      error: 'not_regional',
    })
  })

  it('a reviewer recording the transmittal is forbidden', async () => {
    const made = await regionalDecided()
    expect(
      await recordRegionalTransmittal(
        handle.db,
        world.reviewer,
        made.decisionId,
        signal,
        AFTER_FILING,
      ),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})
