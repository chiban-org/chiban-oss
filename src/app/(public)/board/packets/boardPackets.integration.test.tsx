import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { setAudiences } from '@/features/documents/publish'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { packetMeeting } from '@/test/packetFixtures'
import type { CivilDate } from '@/types/civilDate'

const state = vi.hoisted((): { db: unknown; store: unknown } => ({ db: null, store: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/features/storage/objectStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/storage/objectStore')>()),
  getObjectStore: () => state.store,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { default: Page } = await import('./[token]/page')
const { GET } = await import('./[token]/documents/[versionId]/route')

const signal = new AbortController().signal
let handle: TestDb
let token = ''
let versionId = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const world: PermitWorld = await setupPermitWorld(handle.db)
  const { store } = await makeTestStore()
  state.store = store
  const app = await makeApplication(handle.db, world)
  const up = await uploadAs(
    handle.db,
    store,
    world.applicant,
    { kind: 'application', id: app.applicationId },
    pdfBytes('packet page'),
    { title: 'Septic design' },
  )
  await setAudiences(
    handle.db,
    world.staff,
    { documentId: up.documentId, audiences: ['board'] },
    signal,
  )
  versionId = up.versionId
  const packet = await createPacket(
    handle.db,
    world.staff,
    {
      title: 'April agenda',
      meetingId: await packetMeeting(handle.db, 'zba', '2027-04-14'),
      documentIds: [up.documentId],
    },
    signal,
  )
  if (!packet.ok) throw new Error('packet')
  const mail = createMemoryTransport()
  await sendPacketLink(
    handle.db,
    mail,
    world.staff,
    {
      packetId: packet.value.packetId,
      recipientName: 'Bea',
      recipientEmail: 'bea@alderpond.example',
    },
    signal,
  )
  token = /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? '')?.[1] ?? ''
})
afterAll(async () => {
  await handle.drop()
})

const call = (t: string, v: string) =>
  GET(new Request('https://alderpond.example/x'), {
    params: Promise.resolve({ token: t, versionId: v }),
  })

describe('board packet page and route', () => {
  it('lists the items and the cover page for a valid token', async () => {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token }) }))
    expect(html).toContain('April agenda')
    expect(html).toContain('Septic design')
    expect(html).toContain('Cover page and contents')
    expect(html).not.toMatch(/\.pdf\)/)
  })

  it('a missing or unknown token is a 404 page, not a sign-in prompt', async () => {
    await expect(Page({ params: Promise.resolve({ token: 'unknown' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect((await call('unknown', versionId)).status).toBe(404)
  })

  it('the document route streams a packet version and serves a cover pdf', async () => {
    const res = await call(token, versionId)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    const cover = await call(token, 'cover')
    expect(cover.status).toBe(200)
    expect(cover.headers.get('content-type')).toContain('application/pdf')
  })

  it('a version outside the packet and a malformed id are 404', async () => {
    expect((await call(token, crypto.randomUUID())).status).toBe(404)
    expect((await call(token, 'not-a-uuid')).status).toBe(404)
  })
})
