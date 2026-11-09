import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { storeTownImage } from '@/features/town/townImages'
import { townLogoResponse } from '@/features/town/townLogoResponse'
import { makeTestDb, type TestDb } from '@/test/db'
import { pngBytes } from '@/test/frameFixtures'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let logoSha = ''
let signatureSha = ''

beforeAll(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  const admin = await staffActor(handle.db, 'admin')
  const logo = await storeTownImage(store, await pngBytes(40, 40), signal)
  const signature = await storeTownImage(store, await pngBytes(80, 20), signal)
  if (!logo.ok || !signature.ok) throw new Error('images not stored')
  logoSha = logo.value.objectKey.replace('town-assets/', '')
  signatureSha = signature.value.objectKey.replace('town-assets/', '')
  await publishTownProfileSection(
    handle.db,
    admin,
    {
      section: 'profile',
      slice: {
        officeName: 'Land Use Office',
        addressLines: ['1 Main Street'],
        phone: '',
        email: '',
        website: '',
        officeHours: '',
        logo: logo.value,
      },
    },
    signal,
  )
  await publishTownProfileSection(
    handle.db,
    admin,
    {
      section: 'signers',
      slice: {
        signers: [
          {
            role: 'town_clerk',
            name: 'Terry Clerk',
            title: 'Town Clerk',
            signature: signature.value,
          },
        ],
      },
    },
    signal,
  )
})
afterAll(async () => {
  await handle.drop()
})

describe('the public town logo', () => {
  it('serves the current logo to anyone, as an image', async () => {
    const response = await townLogoResponse(handle.db, store, `${logoSha}.png`, signal)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('never serves a signature, even though it sits in the same store', async () => {
    const response = await townLogoResponse(handle.db, store, `${signatureSha}.png`, signal)
    expect(response.status).toBe(404)
  })

  it('refuses a name with the wrong extension or shape', async () => {
    expect((await townLogoResponse(handle.db, store, `${logoSha}.jpg`, signal)).status).toBe(404)
    expect((await townLogoResponse(handle.db, store, '../secret.png', signal)).status).toBe(404)
  })
})
