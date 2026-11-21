import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { documentVersions, files } from '@/db/schema'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { referToCounsel } from '@/features/enforcement/counsel'
import { recordCureReturnReceipt } from '@/features/enforcement/cureNotices'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { CURE_NOW, type CureHelpers, cureHelpers } from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'
import { XX_CURE_RANGE } from '@/test/packs/xx/cure'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let cure: CureHelpers

beforeAll(() => {
  setActivePackForTest(XX_CURE_RANGE)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  cure = cureHelpers(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

async function curedCase(receiptOn: string | null): Promise<string> {
  const { caseId, findingIds } = await cure.foundCase()
  await cure.chooseCure(caseId)
  const sent = await cure.send(caseId, findingIds)
  if (!sent.ok) throw new Error(sent.error)
  if (receiptOn !== null) {
    const done = await recordCureReturnReceipt(
      handle.db,
      world.staff,
      { cureNoticeId: sent.value.ids[0] as string, receivedOn: d(receiptOn) },
      signal,
      CURE_NOW,
    )
    if (!done.ok) throw new Error(done.error)
  }
  return caseId
}

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

describe('a ranged penalty on the cure path with no order', () => {
  it('shows the range from the cure notice return receipt date', async () => {
    const caseId = await curedCase('2027-03-02')
    const detail = await loadCaseDetail(handle.db, world.staff, caseId, d('2027-03-12'), signal)
    if (!detail.ok) throw new Error(detail.error)
    expect(detail.value.exposure).toMatchObject({
      kind: 'range',
      fromDate: '2027-03-02',
      days: 10,
    })
    expect(detail.value.exposure).not.toHaveProperty('cents')
  })

  it('has no start date before a return receipt is recorded', async () => {
    const caseId = await curedCase(null)
    const detail = await loadCaseDetail(handle.db, world.staff, caseId, d('2027-03-12'), signal)
    if (!detail.ok) throw new Error(detail.error)
    expect(detail.value.exposure).toMatchObject({ kind: 'range', fromDate: null, days: 0 })
  })

  it('the counsel packet carries the range copy and no estimate', async () => {
    const caseId = await curedCase('2027-03-02')
    const referred = await referToCounsel(
      handle.db,
      store,
      world.staff,
      {
        caseId,
        counselName: 'Attorney Rivera',
        purpose: 'penalty_action',
        referredOn: d('2027-03-12'),
      },
      signal,
      new Date('2027-03-12T15:00:00Z'),
    )
    if (!referred.ok) throw new Error(referred.error)
    const text = await packetText(referred.value.packetDocumentId)
    expect(text).toContain('Statutory range, set by the court')
    expect(text).toContain('No permit: $100.00 to $2,500.00 per day')
    expect(text).toContain('Economic benefit: up to 2 times the economic benefit')
    expect(text).not.toContain('Estimated exposure')
  })
})
