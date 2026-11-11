import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { documentVersions, files, rtkReleases } from '@/db/schema'
import { MAX_ATTACHED_BYTES } from '@/features/rtk/releaseMail'
import { refuseField } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import {
  loggedRequest,
  type ReleasableRecord,
  RTK_TODAY,
  releasableRecord,
} from '@/test/rtkFixtures'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./actions')

const h = actionHarness()
h.useObjectStore()
const custodian = () => h.actorFor('records_custodian')

const prepared: { requestId: string; record: ReleasableRecord }[] = []

beforeAll(async () => {
  await seedParcelWorld(h.db)
  for (let i = 0; i < 4; i++) {
    const requestId = await loggedRequest(h.db, await custodian())
    prepared.push({
      requestId,
      record: await releasableRecord(h.db, h.store, await custodian(), requestId),
    })
  }
  vi.useFakeTimers({ toFake: ['Date'], now: RTK_TODAY })
})
afterAll(() => {
  vi.useRealTimers()
})

async function releaseForm(patch: Record<string, string> = {}) {
  const next = prepared.shift()
  if (next === undefined) throw new Error('no prepared release')
  const { requestId, record } = next
  h.signIn(await custodian())
  const form = h.form({
    requestId,
    items: `${record.documentId}:${record.approvalId}`,
    releasedOn: '2026-11-04',
    method: 'email',
    recipientEmail: 'jordan@example.test',
    ...patch,
  })
  return { form, record }
}

describe('createReleaseAction by email attachment', () => {
  it('asks where to send the records when none is given', async () => {
    const { form } = await releaseForm({ recipientEmail: '' })
    expect(await actions.createReleaseAction(form)).toEqual(
      refuseField('recipientEmail', 'Enter the email address to send the records to.'),
    )
  })

  it('says the records were emailed', async () => {
    const { form } = await releaseForm()
    expect(await actions.createReleaseAction(form)).toEqual({
      ok: true,
      message: 'Records released and emailed to the requester.',
    })
  })

  it('says a link went instead when the files were too large to attach', async () => {
    const { form, record } = await releaseForm()
    const [version] = await h.db
      .select({ sha256: documentVersions.fileSha256 })
      .from(documentVersions)
      .where(eq(documentVersions.id, record.versionId))
    await h.db
      .update(files)
      .set({ sizeBytes: MAX_ATTACHED_BYTES + 1 })
      .where(eq(files.sha256, version?.sha256 ?? ''))
    expect(await actions.createReleaseAction(form)).toEqual({
      ok: true,
      message:
        'Records released. The files were too large to attach, so the requester was emailed a link instead.',
    })
  })
})

describe('reissueLinkAction', () => {
  it('waits for the link to expire, then emails a new one', async () => {
    const { form } = await releaseForm({ method: 'electronic_link' })
    expect(await actions.createReleaseAction(form)).toMatchObject({ ok: true })
    const [release] = await h.db
      .select({ id: rtkReleases.id })
      .from(rtkReleases)
      .where(eq(rtkReleases.method, 'electronic_link'))
    const reissue = () =>
      actions.reissueLinkAction(
        h.form({ releaseId: release?.id ?? '', recipientEmail: 'jordan@example.test' }),
      )
    expect(await reissue()).toEqual({
      ok: false,
      error: 'The current link still works. Send a new one after it expires.',
    })
    vi.setSystemTime(new Date(RTK_TODAY.getTime() + 31 * 24 * 60 * 60 * 1000))
    expect(await reissue()).toEqual({ ok: true, message: 'A new link was emailed.' })
    expect(h.mail.sent.at(-1)?.to).toBe('jordan@example.test')
  })
})
