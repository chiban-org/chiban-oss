import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { configVersions } from '@/db/schema'
import { seedTownProfile } from '@/features/demo/seedTownProfile'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { ObjectStore } from '@/features/storage/objectStore'
import { SIGNER_ROLES } from '@/features/town/profileSchema'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await makeUser(handle.db, { role: 'admin', email: 'admin@alderpond.example' })
  store = (await makeTestStore()).store
})
afterAll(async () => {
  await handle.drop()
})

describe('seedTownProfile', () => {
  it('publishes a full profile with a logo and every signer', async () => {
    expect(await seedTownProfile(handle.db, store, signal)).toBe(true)
    const frame = await documentFrame(handle.db, { board: 'zba' }, signal, store)
    expect(frame.officeName).toBe('Alder Pond Zoning Board of Adjustment')
    expect(frame.logo).not.toBeNull()
    expect(frame.signers.map((s) => s.role).sort()).toEqual([...SIGNER_ROLES].sort())
    expect(frame.signers.find((s) => s.role === 'building_official')?.signature).not.toBeNull()
  })

  it('keeps the footer free of the contact details the profile prints above it', async () => {
    const frame = await documentFrame(handle.db, {}, signal, store)
    expect(frame.footerText).not.toMatch(/office hours|\d{3}-\d{3}-\d{4}|@|https?:/i)
  })

  it('changes nothing on an already seeded database', async () => {
    expect(await seedTownProfile(handle.db, store, signal)).toBe(false)
    const versions = await handle.db
      .select()
      .from(configVersions)
      .where(and(eq(configVersions.kind, 'town_profile'), eq(configVersions.key, 'default')))
    expect(versions).toHaveLength(1)
  })
})
