import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { rtkReleases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition } from '@/features/renditions/approvals'
import { createRelease } from '@/features/rtk/releases'
import { logRequest } from '@/features/rtk/requests'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'
import { formatCivilDate } from '@/lib/formatDate'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { visibleText } from '@/test/leaks'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

const state = vi.hoisted((): { db: unknown } => ({ db: null }))
vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))

const { default: ReleasePage } = await import('@/app/(public)/records/releases/[token]/page')

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let custodian: Actor
let token = ''
let releaseId = ''

const render = async () =>
  visibleText(renderToStaticMarkup(await ReleasePage({ params: Promise.resolve({ token }) })))

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const { store } = await makeTestStore()
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  const admin = await staffActor(handle.db, 'admin')
  await saveAndPublish(handle.db, admin, 'town_profile', 'default', {
    ...TOWN_PROFILE_SKELETON,
    officeName: 'Fernhollow Records Desk',
  })
  const logged = await logRequest(
    handle.db,
    custodian,
    { receivedOn: d('2026-10-30'), receivedVia: 'email', description: 'Barn permit letters' },
    signal,
  )
  if (!logged.ok) throw new Error('log')
  const doc = await uploadRedactionFixture(
    handle.db,
    store,
    custodian,
    'letter.pdf',
    undefined,
    false,
  )
  const redacted = await redactedVersionOf(
    handle.db,
    store,
    custodian,
    doc,
    'rtk_release',
    logged.value.requestId,
  )
  const approved = await approveRendition(
    handle.db,
    custodian,
    {
      versionId: redacted,
      purpose: 'rtk_release',
      rtkRequestId: logged.value.requestId,
      reviewStatement: STATEMENT,
    },
    signal,
    store,
  )
  if (!approved.ok) throw new Error('approve')
  const mail = createMemoryTransport()
  const released = await createRelease(
    handle.db,
    store,
    mail,
    custodian,
    {
      requestId: logged.value.requestId,
      releasedOn: d('2026-11-02'),
      method: 'electronic_link',
      recipientEmail: 'wren.halloway@example.test',
      items: [{ documentId: doc.documentId, approvalId: approved.value.approvalId }],
    },
    signal,
    new Date(),
  )
  if (!released.ok) throw new Error(`release ${released.error}`)
  token = /\/records\/releases\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
  const [row] = await handle.db
    .select({ id: rtkReleases.id })
    .from(rtkReleases)
    .where(eq(rtkReleases.requestId, logged.value.requestId))
  releaseId = row?.id ?? ''
})
afterAll(async () => {
  await handle.drop()
})

describe('records release page', () => {
  it('says until when a live link works', async () => {
    const [row] = await handle.db
      .select({ expiresAt: rtkReleases.linkExpiresAt })
      .from(rtkReleases)
      .where(eq(rtkReleases.id, releaseId))
    if (row?.expiresAt == null) throw new Error('no expiry')
    const until = formatCivilDate(todayInTimeZone('America/New_York', row.expiresAt))
    expect(await render()).toContain(`This link works until ${until}.`)
  })

  it('names the town office on an expired link', async () => {
    const [row] = await handle.db
      .select({ expiresAt: rtkReleases.linkExpiresAt })
      .from(rtkReleases)
      .where(eq(rtkReleases.id, releaseId))
    if (row?.expiresAt == null) throw new Error('no expiry')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(row.expiresAt.getTime() + 60_000))
    try {
      expect(await render()).toContain(
        'This link has expired. Ask the Fernhollow Records Desk for a new one.',
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
