import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import type { ObjectStore } from '@/features/storage/objectStore'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'
import { buildSampleLetterPdf } from '@/features/town/samplePdf'
import { TOWN_IMAGE_MAX_BYTES } from '@/features/town/townImages'
import { makeTestDb, type TestDb } from '@/test/db'
import { pngBytes } from '@/test/frameFixtures'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'

interface MockState {
  db: unknown
  actor: unknown
  store: ObjectStore | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null, store: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
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
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/features/storage/objectStore', async (original) => ({
  ...(await original<typeof import('@/features/storage/objectStore')>()),
  getObjectStore: () => state.store,
}))

const actions = await import('@/app/(staff)/staff/settings/town-profile/actions')

const signal = new AbortController().signal
const FORBIDDEN = 'You do not have permission to do this.'
let handle: TestDb
let admin: Actor
let staff: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  state.store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  staff = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.actor = staff
})

function form(fields: Record<string, string | Blob>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

const PROFILE = { ...TOWN_PROFILE_SKELETON, officeName: 'Land Use Office' }

describe('town profile actions', () => {
  it('refuse to publish or upload for someone who cannot edit configuration', async () => {
    const published = await actions.publishTownSectionAction(
      form({ section: 'profile', body: JSON.stringify(PROFILE) }),
    )
    expect(published).toEqual({ ok: false, error: FORBIDDEN })
    const uploaded = await actions.uploadTownImageAction(
      form({ file: file(await pngBytes(4, 4), 'logo.png', 'image/png') }),
    )
    expect(uploaded).toEqual({ ok: false, error: FORBIDDEN })
  })

  it('check the upload type and size on the server, not the file name', async () => {
    state.actor = admin
    const disguised = file(new TextEncoder().encode('GIF89a'), 'logo.png', 'image/png')
    expect(await actions.uploadTownImageAction(form({ file: disguised }))).toEqual({
      ok: false,
      error: 'Choose a PNG or JPEG image.',
    })
    const huge = file(new Uint8Array(TOWN_IMAGE_MAX_BYTES + 1), 'logo.png', 'image/png')
    expect(await actions.uploadTownImageAction(form({ file: huge }))).toEqual({
      ok: false,
      error: 'The image is larger than 2 MB. Choose a smaller file.',
    })
  })

  it('upload a logo and publish it with the profile', async () => {
    state.actor = admin
    const uploaded = await actions.uploadTownImageAction(
      form({ file: file(await pngBytes(30, 30), 'seal.png', 'image/png') }),
    )
    if (!uploaded.ok) throw new Error(uploaded.error)
    const published = await actions.publishTownSectionAction(
      form({ section: 'profile', body: JSON.stringify({ ...PROFILE, logo: uploaded.image }) }),
    )
    expect(published).toEqual({ ok: true, message: 'Put version 1 into use.' })
  })

  it('names the field when a publish is refused', async () => {
    state.actor = admin
    const result = await actions.publishTownSectionAction(
      form({ section: 'profile', body: JSON.stringify({ ...PROFILE, addressLines: [] }) }),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.fieldErrors?.addressLines).toBe('Enter at least one address line.')
  })

  it('the sample PDF is only for someone who can edit configuration', async () => {
    expect(await buildSampleLetterPdf(handle.db, staff, {}, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const sample = await buildSampleLetterPdf(
      handle.db,
      admin,
      { store: state.store ?? undefined },
      signal,
    )
    if (!sample.ok) throw new Error(sample.error)
    expect(await pdfText(sample.value)).toContain('Land Use Office')
  })
})
