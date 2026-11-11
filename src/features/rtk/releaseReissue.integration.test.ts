import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, rtkReleaseLinks } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { openRelease } from '@/features/rtk/releaseLinks'
import { reissueReleaseLink } from '@/features/rtk/releaseReissue'
import { createRelease, type ReleaseInput } from '@/features/rtk/releases'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { loggedRequest, RTK_TODAY, releasableRecord } from '@/test/rtkFixtures'
import { err } from '@/types/result'

const signal = new AbortController().signal
const DAY_MS = 24 * 60 * 60 * 1000
const LATER = new Date(RTK_TODAY.getTime() + 40 * DAY_MS)
let handle: TestDb
let store: ObjectStore
let custodian: Actor
let mail: ReturnType<typeof createMemoryTransport>
let releaseId: string

function tokenIn(text: string | undefined): string {
  return /\/records\/releases\/([A-Za-z0-9_-]+)/.exec(text ?? '')?.[1] ?? ''
}

async function released(method: ReleaseInput['method']): Promise<string> {
  const requestId = await loggedRequest(handle.db, custodian)
  const record = await releasableRecord(handle.db, store, custodian, requestId)
  const result = await createRelease(
    handle.db,
    store,
    mail,
    custodian,
    {
      requestId,
      releasedOn: '2026-11-04',
      method,
      items: [{ documentId: record.documentId, approvalId: record.approvalId }],
      recipientEmail: 'jordan@example.test',
    },
    signal,
    RTK_TODAY,
  )
  if (!result.ok) throw new Error(result.error)
  return result.value.releaseId
}

const reissue = (now: Date, patch: { releaseId?: string; actor?: Actor } = {}) =>
  reissueReleaseLink({ db: handle.db, mail, signal, now }, patch.actor ?? custodian, {
    releaseId: patch.releaseId ?? releaseId,
    recipientEmail: 'Jordan.New@example.test',
  })

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  mail = createMemoryTransport()
  releaseId = await released('electronic_link')
})
afterEach(async () => {
  await handle.drop()
})

describe('reissueReleaseLink', () => {
  it('sends a new working link after the old one expired, and the old one stays dead', async () => {
    const oldToken = tokenIn(mail.sent.at(-1)?.text)
    expect(await openRelease(handle.db, oldToken, LATER, signal)).toEqual(err('expired'))
    const result = await reissue(LATER)
    expect(result).toMatchObject({ ok: true })
    const sent = mail.sent.at(-1)
    expect(sent?.to).toBe('jordan.new@example.test')
    expect(sent?.subject).toBe('Records for request RK-2026-0001')
    const newToken = tokenIn(sent?.text)
    expect(newToken).not.toBe(oldToken)
    expect((await openRelease(handle.db, newToken, LATER, signal)).ok).toBe(true)
    expect(await openRelease(handle.db, oldToken, LATER, signal)).toEqual(err('expired'))
  })

  it('records who sent the new link and to whom', async () => {
    await reissue(LATER)
    const [link] = await handle.db.select().from(rtkReleaseLinks)
    expect(link).toMatchObject({
      releaseId,
      sentTo: 'jordan.new@example.test',
      createdBy: custodian.userId,
    })
    expect(link?.tokenHash).not.toContain(tokenIn(mail.sent.at(-1)?.text))
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'rtk.release_link_reissued'))
    expect(audits).toHaveLength(1)
  })

  it('refuses while the current link still works', async () => {
    expect(await reissue(RTK_TODAY)).toEqual(err('link_active'))
    await reissue(LATER)
    expect(await reissue(new Date(LATER.getTime() + DAY_MS))).toEqual(err('link_active'))
  })

  it('refuses a release that never had a link', async () => {
    const paper = await released('paper')
    expect(await reissue(LATER, { releaseId: paper })).toEqual(err('no_link'))
  })

  it('needs the Right-to-Know permission', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    expect(await reissue(LATER, { actor: reviewer })).toEqual(err('forbidden'))
  })
})
