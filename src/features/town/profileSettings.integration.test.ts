import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { getPublished } from '@/features/config/store'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { TownProfileBody } from '@/features/town/profileSchema'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { storeTownImage } from '@/features/town/townImages'
import { makeTestDb, type TestDb } from '@/test/db'
import { pngBytes } from '@/test/frameFixtures'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let admin: Actor
let staff: Actor

const PROFILE_SLICE = {
  officeName: 'Land Use Office',
  addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
  phone: '603-555-0100',
  email: 'landuse@alderpond.example',
  website: '',
  officeHours: '',
  logo: null,
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  store = (await makeTestStore()).store
  admin = await staffActor(handle.db, 'admin')
  staff = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})

async function published(): Promise<TownProfileBody | null> {
  const row = await getPublished(handle.db, 'town_profile', 'default', signal)
  return (row?.body as TownProfileBody | undefined) ?? null
}

describe('town profile sections', () => {
  it('refuses someone who cannot edit configuration', async () => {
    const result = await publishTownProfileSection(
      handle.db,
      staff,
      { section: 'profile', slice: PROFILE_SLICE },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('publishes each section without touching the others', async () => {
    const first = await publishTownProfileSection(
      handle.db,
      admin,
      { section: 'profile', slice: PROFILE_SLICE },
      signal,
    )
    expect(first.ok).toBe(true)
    const signers = [
      { role: 'town_clerk', name: 'Sam Clerk', title: 'Town Clerk', signature: null },
    ]
    const second = await publishTownProfileSection(
      handle.db,
      admin,
      { section: 'signers', slice: { signers, officeName: 'Ignored Office' } },
      signal,
    )
    expect(second).toEqual({ ok: true, value: { version: 2 } })
    const body = await published()
    expect(body?.officeName).toBe('Land Use Office')
    expect(body?.signers).toEqual(signers)
  })

  it('refuses two signers for one role and keeps the published version', async () => {
    const signer = { role: 'town_clerk', name: 'Sam Clerk', title: 'Town Clerk', signature: null }
    const result = await publishTownProfileSection(
      handle.db,
      admin,
      { section: 'signers', slice: { signers: [signer, signer] } },
      signal,
    )
    expect(result.ok).toBe(false)
    expect((await published())?.signers).toHaveLength(1)
  })

  it('the frame loader applies the board override and loads the logo from the store', async () => {
    const logo = await storeTownImage(store, await pngBytes(40, 20), signal)
    if (!logo.ok) throw new Error(logo.error)
    expect(logo.value).toMatchObject({ contentType: 'image/png', width: 40, height: 20 })
    await publishTownProfileSection(
      handle.db,
      admin,
      { section: 'profile', slice: { ...PROFILE_SLICE, logo: logo.value } },
      signal,
    )
    const current = await published()
    if (current === null) throw new Error('profile not published')
    await publishTownProfileSection(
      handle.db,
      admin,
      {
        section: 'letterhead',
        slice: {
          letterhead: current.letterhead,
          boardOverrides: { zba: { officeName: 'Zoning Board of Adjustment' } },
        },
      },
      signal,
    )
    const zba = await documentFrame(handle.db, { board: 'zba' }, signal, store)
    const plain = await documentFrame(handle.db, {}, signal, store)
    expect(zba.officeName).toBe('Zoning Board of Adjustment')
    expect(plain.officeName).toBe('Land Use Office')
    expect(plain.logo?.width).toBe(40)
    expect(plain.signers.map((s) => s.name)).toEqual(['Sam Clerk'])
  })
})
