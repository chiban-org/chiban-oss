import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { boardMeetings } from '@/db/schema'
import { revokePacketLink, sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { setAudiences } from '@/features/documents/publish'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { MailTransport } from '@/features/mail/transport'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { packetMeeting } from '@/test/packetFixtures'

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
let expiredToken = ''
let revokedToken = ''
let cancelledToken = ''
let versionId = ''
let world: PermitWorld

async function linkFor(
  mail: MailTransport & { sent: { text: string }[] },
  input: { packetId: string; name: string; now: Date },
): Promise<{ token: string; linkId: string }> {
  const sent = await sendPacketLink(
    handle.db,
    mail,
    world.staff,
    {
      packetId: input.packetId,
      recipientName: input.name,
      recipientEmail: `${input.name}@example.org`,
    },
    signal,
    input.now,
  )
  if (!sent.ok) throw new Error(sent.error)
  const text = mail.sent.at(-1)?.text ?? ''
  return {
    token: /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '',
    linkId: sent.value.linkId,
  }
}

async function packetOn(
  date: string,
  documentId: string,
): Promise<{ packetId: string; meetingId: string }> {
  const meetingId = await packetMeeting(handle.db, 'zba', date)
  const packet = await createPacket(
    handle.db,
    world.staff,
    { title: `Packet ${date}`, meetingId, documentIds: [documentId] },
    signal,
  )
  if (!packet.ok) throw new Error('packet')
  return { packetId: packet.value.packetId, meetingId }
}

const NOVEMBER_1 = new Date('2026-11-01T15:00:00Z')

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  await saveAndPublish(handle.db, world.admin, 'town_profile', 'default', {
    ...TOWN_PROFILE_SKELETON,
    phone: '603-555-0100',
    email: 'landuse@alderpond.example',
  })
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
  const april = await packetOn('2027-04-14', up.documentId)
  await handle.db
    .update(boardMeetings)
    .set({ location: 'Alder Pond Town Hall, Meeting Room 2' })
    .where(eq(boardMeetings.id, april.meetingId))
  const mail = createMemoryTransport()
  token = (await linkFor(mail, { packetId: april.packetId, name: 'bea', now: NOVEMBER_1 })).token
  expiredToken = (
    await linkFor(mail, {
      packetId: april.packetId,
      name: 'old',
      now: new Date('2026-01-01T15:00:00Z'),
    })
  ).token
  const revoked = await linkFor(mail, { packetId: april.packetId, name: 'off', now: NOVEMBER_1 })
  revokedToken = revoked.token
  const turnedOff = await revokePacketLink(
    handle.db,
    world.staff,
    { linkId: revoked.linkId },
    signal,
  )
  if (!turnedOff.ok) throw new Error(turnedOff.error)
  const may = await packetOn('2027-05-12', up.documentId)
  cancelledToken = (await linkFor(mail, { packetId: may.packetId, name: 'gone', now: NOVEMBER_1 }))
    .token
  await handle.db
    .update(boardMeetings)
    .set({ status: 'cancelled', cancelReason: 'No quorum' })
    .where(eq(boardMeetings.id, may.meetingId))
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-08T15:00:00Z') })
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(async () => {
  await handle.drop()
})

const call = (t: string, v: string) =>
  GET(new Request('https://alderpond.example/x'), {
    params: Promise.resolve({ token: t, versionId: v }),
  })

const page = async (t: string) =>
  renderToStaticMarkup(await Page({ params: Promise.resolve({ token: t }) }))

const CONTACT = /Land Use Office[\s\S]*603-555-0100[\s\S]*landuse@alderpond\.example/

describe('board packet page and route', () => {
  it('names the meeting, when and where, the expiry, and lists the items under the cover', async () => {
    const html = await page(token)
    expect(html).toContain('<h1>Zoning Board of Adjustment packet</h1>')
    expect(html).toContain(
      'Wednesday, April 14, 2027 at 7:00 PM, Alder Pond Town Hall, Meeting Room 2',
    )
    expect(html).toContain('This link works until November 15, 2026.')
    expect(html).toContain('Septic design')
    expect(html).toContain('Cover page and contents')
    expect(html.indexOf('>Cover and agenda</h3>')).toBeLessThan(html.indexOf('Septic design'))
    expect(html).toContain('Documents open in a new tab.')
    expect(html).not.toMatch(/\.pdf\)/)
  })

  it('says an expired link has run out without repeating its heading, and gives the office contact', async () => {
    const html = await page(expiredToken)
    expect(html).toContain('<h1>This link has expired</h1>')
    expect(html).not.toContain('<p>This link has expired.')
    expect(html).toMatch(CONTACT)
  })

  it('says the office turned a revoked link off', async () => {
    const html = await page(revokedToken)
    expect(html).toContain('The land use office turned this link off.')
    expect(html).toMatch(CONTACT)
    expect(html).not.toContain('Septic design')
  })

  it('says the meeting was cancelled for a link to a cancelled meeting', async () => {
    const html = await page(cancelledToken)
    expect(html).toContain('The May 12 meeting was cancelled. Its packet is closed.')
    expect(html).toMatch(CONTACT)
    expect(html).not.toContain('Septic design')
  })

  it('a missing or unknown token is a 404 page, not a sign-in prompt', async () => {
    await expect(Page({ params: Promise.resolve({ token: 'unknown' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect((await call('unknown', versionId)).status).toBe(404)
  })

  it('the document route answers 410 with the reason for a revoked or cancelled link', async () => {
    const revoked = await call(revokedToken, versionId)
    expect(revoked.status).toBe(410)
    expect(await revoked.text()).toContain('The land use office turned this link off.')
    const cancelled = await call(cancelledToken, 'cover')
    expect(cancelled.status).toBe(410)
    expect(await cancelled.text()).toContain('The May 12 meeting was cancelled.')
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
