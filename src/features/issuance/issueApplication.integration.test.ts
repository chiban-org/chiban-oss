import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, documents, documentVersions, files, notificationOutbox } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { quickIssue } from '@/features/counter/quickIssue'
import { issueApplication } from '@/features/issuance/issueApplication'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import { makeTestStore } from '@/test/objectStore'
import { setupPayments } from '@/test/paymentFixtures'
import { pdfPages } from '@/test/pdfText'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let trade: TradeFixture
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function rowVersion(): Promise<number> {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, trade.applicationId))
  return row?.rowVersion ?? 0
}

async function pay() {
  const paid = await recordCounterPayment(
    handle.db,
    trade.world.staff,
    {
      method: 'cash',
      amountCents: 4500,
      payerName: 'Pat',
      allocations: [lineAllocation(trade, 4500)],
    },
    signal,
    NOW,
  )
  if (!paid.ok) throw new Error(paid.error)
}

const issue = (actor = trade.world.staff) =>
  issueApplication(handle.db, actor, { applicationId: trade.applicationId }, signal, {
    store,
    now: NOW,
  })

describe('issueApplication', () => {
  it('issuing stores the permit pdf as a document on the application and queues the issued notification', async () => {
    await pay()
    const result = await issue()
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    const [doc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.id, result.value.documentId))
    expect(doc).toMatchObject({
      recordKind: 'application',
      recordId: trade.applicationId,
      docKind: 'issued_permit',
      isPublic: false,
      audiences: ['project_parties'],
    })
    const [version] = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, doc?.id ?? ''))
    const [file] = await handle.db
      .select()
      .from(files)
      .where(eq(files.sha256, version?.fileSha256 ?? ''))
    const stream = await store.getStream(file?.storageKey ?? '', signal)
    if (!stream.ok) throw new Error('bytes')
    const pages = await pdfPages(new Uint8Array(await new Response(stream.value).arrayBuffer()))
    expect(pages.join('\n')).toContain(trade.number)
    const events = (await handle.db.select().from(notificationOutbox)).map((r) => r.event)
    expect(events).toContain('application_issued')
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, trade.applicationId))
    expect(row?.state).toBe('issued')
  })

  it('issuance blocked by fees.paid returns gateBlocked and stores nothing', async () => {
    const before = (await handle.db.select().from(documents)).length
    const result = await issue()
    expect(result.ok).toBe(false)
    expect(!result.ok && typeof result.error === 'object' && 'gateBlocked' in result.error).toBe(
      true,
    )
    expect((await handle.db.select().from(documents)).length).toBe(before)
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, trade.applicationId))
    expect(row?.state).toBe('submitted')
  })

  it('a reviewer cannot issue', async () => {
    await pay()
    expect(await issue(trade.world.reviewer)).toEqual({ ok: false, error: 'forbidden' })
    expect(await rowVersion()).toBeGreaterThan(0)
  })

  it('quick issue stores the permit document', async () => {
    await setupPayments(handle.db, trade.world.admin)
    const made = await quickIssue(
      handle.db,
      trade.world.staff,
      {
        parcelId: trade.world.parcelId,
        applicationTypeKey: 'EL',
        values: { description: 'Panel upgrade', service_amps: 200 },
        contractor: { name: 'Pat Contractor' },
        license: { number: 'EL-20418', type: 'Electrician', result: 'active' },
        payerName: 'Pat Contractor',
        payment: { method: 'cash', tenderedCents: 5000 },
      },
      signal,
      { now: NOW },
    )
    if (!made.ok) throw new Error(JSON.stringify(made.error))
    const permits = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.recordId, made.value.applicationId))
    expect(permits.map((d) => d.docKind)).toContain('issued_permit')
  })
})
