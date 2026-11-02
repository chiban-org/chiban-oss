import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { counselOutcomes, documentVersions, files } from '@/db/schema'
import { certifyImminentPeril, recordEnforcementAppeal } from '@/features/enforcement/appeals'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { recordCounselOutcome, referToCounsel } from '@/features/enforcement/counsel'
import { recordFine } from '@/features/enforcement/fines'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  completeService,
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  setupEnforcementWorld,
  uploadProof,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/minio'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-20T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let order: IssuedOrder

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  order = await issuedOrder(handle.db, store, world)
})
afterEach(async () => {
  await handle.drop()
})

async function packetText(documentId: string): Promise<string> {
  const [version] = await handle.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
  const [file] = await handle.db
    .select()
    .from(files)
    .where(eq(files.sha256, version?.fileSha256 ?? ''))
  const stream = await store.getStream(file?.storageKey ?? '', signal)
  if (!stream.ok) throw new Error('bytes')
  const text = await pdfText(new Uint8Array(await new Response(stream.value).arrayBuffer()))
  return text.replace(/\n/g, ' ')
}

async function refer(purpose: 'motion_to_enforce' | 'penalty_action' = 'motion_to_enforce') {
  const referred = await referToCounsel(
    handle.db,
    store,
    world.staff,
    { caseId: order.caseId, counselName: 'Attorney Rivera', purpose, referredOn: d('2027-07-20') },
    signal,
    NOW,
  )
  if (!referred.ok) throw new Error(referred.error)
  return referred.value
}

describe('counsel referrals', () => {
  it('the packet shows an imminent peril certification and that the case is not stayed', async () => {
    const appeal = await recordEnforcementAppeal(
      handle.db,
      world.staff,
      {
        caseId: order.caseId,
        targetKind: 'order',
        targetId: order.orderId,
        filedOn: d('2027-03-05'),
        appellantName: 'Pat Owner',
      },
      signal,
      NOW,
    )
    if (!appeal.ok) throw new Error(appeal.error)
    const certified = await certifyImminentPeril(
      handle.db,
      world.staff,
      {
        appealId: appeal.value.appealId,
        categories: ['safety'],
        statement: 'The garage wall is leaning over the road.',
        certifiedOn: d('2027-03-06'),
      },
      signal,
    )
    if (!certified.ok) throw new Error(certified.error)
    const text = await packetText((await refer()).packetDocumentId)
    expect(text).toContain('Imminent peril certified March 6, 2027')
    expect(text).toContain('Not stayed')
  })

  it('packet lists every service proof by title', async () => {
    await completeService(handle.db, store, world, order, '2027-03-01')
    await uploadProof(handle.db, store, world.staff, order.caseId, 'Affidavit of posting')
    const referral = await refer()
    const text = await packetText(referral.packetDocumentId)
    expect(text).toContain('Return of service')
    expect(text).toContain('Affidavit of posting')
    expect(text).toContain(order.number)
    expect(text).toContain('Pat Owner')
    expect(text).toContain('March 22, 2027')
    expect(text).toContain('RSA 21:35 II')
    expect(text).toContain(
      'Estimated statutory exposure for counsel. Nothing is owed unless a court imposes it.',
    )
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(text).not.toContain('record_owner')
  })

  it('a referral without enforcement.refer_counsel is forbidden', async () => {
    const result = await referToCounsel(
      handle.db,
      store,
      world.inspector,
      {
        caseId: order.caseId,
        counselName: 'Attorney Rivera',
        purpose: 'motion_to_enforce',
        referredOn: d('2027-07-20'),
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('outcome rows are insert-only', async () => {
    const referral = await refer()
    const recorded = await recordCounselOutcome(
      handle.db,
      world.staff,
      {
        referralId: referral.referralId,
        kind: 'hearing_held',
        occurredOn: d('2027-08-01'),
        court: 'District Court',
      },
      signal,
    )
    if (!recorded.ok) throw new Error(recorded.error)
    await expect(
      handle.db
        .update(counselOutcomes)
        .set({ note: 'edited' })
        .where(eq(counselOutcomes.id, recorded.value.outcomeId)),
    ).rejects.toThrow()
    await expect(
      handle.db.execute(sql`delete from counsel_outcomes where id = ${recorded.value.outcomeId}`),
    ).rejects.toThrow()
  })

  it('a referral records two outcomes in order', async () => {
    const referral = await refer()
    for (const [kind, on] of [
      ['motion_filed', '2027-08-01'],
      ['hearing_held', '2027-09-01'],
    ] as const) {
      const recorded = await recordCounselOutcome(
        handle.db,
        world.staff,
        { referralId: referral.referralId, kind, occurredOn: d(on) },
        signal,
      )
      expect(recorded.ok).toBe(true)
    }
    expect(await handle.db.select().from(counselOutcomes)).toHaveLength(2)
  })

  it('a judgment for the town through counsel starts the penalty accrual on the case', async () => {
    const referral = await refer('penalty_action')
    const outcome = await recordCounselOutcome(
      handle.db,
      world.staff,
      {
        referralId: referral.referralId,
        kind: 'judgment_for_town',
        occurredOn: d('2027-08-01'),
        court: 'District Court',
        docket: '2027-CV-0099',
        documentId: await uploadProof(
          handle.db,
          store,
          world.staff,
          order.caseId,
          'Judgment',
          'court_document',
        ),
      },
      signal,
    )
    if (!outcome.ok) throw new Error(outcome.error)
    const detail = await loadCaseDetail(
      handle.db,
      world.staff,
      order.caseId,
      d('2027-08-11'),
      signal,
    )
    expect(detail.ok && detail.value.exposure?.fromDate).toBe('2027-08-01')
  })

  it('a judgment for the town on a penalty action supports a fine with no order', async () => {
    const referral = await refer('penalty_action')
    const document = await uploadProof(
      handle.db,
      store,
      world.staff,
      order.caseId,
      'Judgment',
      'court_document',
    )
    const outcome = await recordCounselOutcome(
      handle.db,
      world.staff,
      {
        referralId: referral.referralId,
        kind: 'judgment_for_town',
        occurredOn: d('2027-08-01'),
        court: 'District Court',
        docket: '2027-CV-0099',
        documentId: document,
      },
      signal,
    )
    if (!outcome.ok) throw new Error(outcome.error)
    const fine = await recordFine(
      handle.db,
      world.finance,
      {
        caseId: order.caseId,
        kind: 'civil_penalty',
        ruleKey: 'nh.enf.penalty_zoning',
        amountCents: 55000,
        imposedOn: d('2027-08-01'),
        court: 'District Court',
        docket: '2027-CV-0099',
        counselOutcomeId: outcome.value.outcomeId,
      },
      signal,
      NOW,
    )
    expect(fine.ok).toBe(true)
  })

  it('an outcome document from another case is refused', async () => {
    const referral = await refer()
    const other = await issuedOrder(handle.db, store, world, { location: '2 Elm Street' })
    const foreign = await uploadProof(
      handle.db,
      store,
      world.staff,
      other.caseId,
      'Judgment',
      'court_document',
    )
    const result = await recordCounselOutcome(
      handle.db,
      world.staff,
      {
        referralId: referral.referralId,
        kind: 'settled',
        occurredOn: d('2027-08-01'),
        documentId: foreign,
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'document_invalid' })
  })
})
