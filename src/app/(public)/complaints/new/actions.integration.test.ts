import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auditLog, complaints, documents, enforcementCases } from '@/db/schema'
import { databaseContains } from '@/test/databaseSearch'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld } from '@/test/parcels'
import { settle } from '@/test/testHarness/actions/outcome'

interface MockState {
  db: unknown
  csrfCookie: string | null
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok' }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(null) }))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))

const { submitComplaintAction: submitAction } = await import(
  '@/app/(public)/complaints/new/actions'
)
const submitComplaintAction = (formData: FormData) => settle(submitAction(formData))

let handle: TestDb
const photo = readFileSync(
  fileURLToPath(new URL('../../../../test/fixtures/anonymous/gps-artist.jpg', import.meta.url)),
)

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
})

function form(fields: Record<string, string | File | File[]>, token: string | null = 'tok') {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  const base = { locationText: '14 Birch Lane', description: 'A shed with no permit', ...fields }
  for (const [key, value] of Object.entries(base)) {
    for (const v of Array.isArray(value) ? value : [value]) f.append(key, v as string | Blob)
  }
  return f
}

const jpeg = () => new File([new Uint8Array(photo)], 'IMG_1.jpg', { type: 'image/jpeg' })

describe('submitComplaintAction', () => {
  it('rejects a missing csrf token and stores nothing', async () => {
    expect(await submitComplaintAction(form({}, null))).toMatchObject({ ok: false })
    expect(await handle.db.select().from(complaints)).toHaveLength(0)
  })

  it('stores a named complaint with contact fields, a private case, and a stripped photo', async () => {
    const result = await submitComplaintAction(
      form({
        name: 'Pat Neighbor',
        email: 'pat@example.test',
        phone: '603-555-0100',
        photos: jpeg(),
      }),
    )
    expect(result).toEqual({
      redirectsTo: expect.stringMatching(
        /^\/complaints\/received\?ref=CP-\d{4}-\d{4,}&reply=contact$/,
      ),
    })
    const [row] = await handle.db.select().from(complaints)
    expect(row).toMatchObject({
      channel: 'public_named',
      complainantName: 'Pat Neighbor',
      complainantEmail: 'pat@example.test',
      createdBy: null,
    })
    const [kase] = await handle.db.select().from(enforcementCases)
    expect(kase?.isPublic).toBe(false)
    const [doc] = await handle.db.select().from(documents)
    expect(doc).toMatchObject({ docKind: 'enforcement_photo', isPublic: false })
    expect(await databaseContains(handle.db, 'IMG_1')).toEqual([])
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, 'complaint'))
    expect(JSON.stringify(audit)).not.toContain('pat@example.test')
  })

  it('a complaint whose location is a parcel site address is linked to that parcel', async () => {
    const parcelId = await makeParcel(handle.db, [], { siteAddress: '27 Osprey Point Road' })
    expect(
      await submitComplaintAction(form({ locationText: '27 osprey point road ' })),
    ).toMatchObject({ redirectsTo: expect.stringContaining('/complaints/received?ref=') })
    const [complaint] = await handle.db
      .select()
      .from(complaints)
      .where(eq(complaints.parcelId, parcelId))
    expect(complaint?.parcelId).toBe(parcelId)
    const [linkedCase] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, complaint?.caseId ?? ''))
    expect(linkedCase?.parcelId).toBe(parcelId)
  })

  it('accepts a complaint with no contact details at all', async () => {
    const before = (await handle.db.select().from(complaints)).length
    expect(await submitComplaintAction(form({}))).toEqual({
      redirectsTo: expect.stringMatching(/&reply=none$/),
    })
    expect(await handle.db.select().from(complaints)).toHaveLength(before + 1)
  })

  it('refuses six photos, a pdf sent as a photo, and a bad email', async () => {
    const before = (await handle.db.select().from(complaints)).length
    const six = [jpeg(), jpeg(), jpeg(), jpeg(), jpeg(), jpeg()]
    expect(await submitComplaintAction(form({ photos: six }))).toMatchObject({ ok: false })
    const pdf = new File([new TextEncoder().encode('%PDF-1.4\nx')], 'a.jpg', { type: 'image/jpeg' })
    expect(await submitComplaintAction(form({ photos: pdf }))).toMatchObject({ ok: false })
    expect(await submitComplaintAction(form({ email: 'not-an-email' }))).toMatchObject({
      ok: false,
    })
    expect(await handle.db.select().from(complaints)).toHaveLength(before)
  })
})
