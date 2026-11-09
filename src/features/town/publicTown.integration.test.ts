import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { loadPublicTown, publicLogoFor } from '@/features/town/publicTown'
import { storeTownImage } from '@/features/town/townImages'
import { makeTestDb, type TestDb } from '@/test/db'
import { pngBytes } from '@/test/frameFixtures'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore

beforeAll(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
})
afterAll(async () => {
  await handle.drop()
})

describe('the town as the public site shows it', () => {
  it('falls back to the office name and no contact lines before the town is set up', async () => {
    const town = await loadPublicTown(handle.db, signal)
    expect(town).toEqual({
      name: 'Land Use Office',
      office: {
        officeName: 'Land Use Office',
        addressLines: ['Town Hall'],
        phone: '',
        email: '',
        officeHours: '',
      },
      logo: null,
    })
  })

  it('reads the town name from settings and the office lines and seal from the profile', async () => {
    await seedParcelWorld(handle.db)
    const admin = await staffActor(handle.db, 'admin')
    const seal = await storeTownImage(store, await pngBytes(40, 40), signal)
    if (!seal.ok) throw new Error('seal not stored')
    const published = await publishTownProfileSection(
      handle.db,
      admin,
      {
        section: 'profile',
        slice: {
          officeName: 'Land Use Office',
          addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
          phone: '603-555-0100',
          email: 'landuse@alderpond.example',
          website: '',
          officeHours: 'Monday to Thursday, 8 to 4',
          logo: seal.value,
        },
      },
      signal,
    )
    expect(published.ok).toBe(true)
    const town = await loadPublicTown(handle.db, signal)
    expect(town.name).toBe('Town of Alder Pond')
    expect(town.office).toEqual({
      officeName: 'Land Use Office',
      addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
      phone: '603-555-0100',
      email: 'landuse@alderpond.example',
      officeHours: 'Monday to Thursday, 8 to 4',
    })
    const sha = seal.value.objectKey.replace('town-assets/', '')
    expect(town.logo).toEqual({
      src: `/town-logo/${sha}.png`,
      width: seal.value.width,
      height: seal.value.height,
    })
    expect(await publicLogoFor(handle.db, sha, signal)).toEqual({ sha, extension: 'png' })
    expect(await publicLogoFor(handle.db, 'f'.repeat(64), signal)).toBeNull()
  })
})
