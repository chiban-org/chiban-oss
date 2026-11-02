import { NH_STARTERS } from '@packs/nh/starters'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configVersions } from '@/db/schema'
import { adoptStarter } from '@/features/config/adoptStarter'
import { pinCurrent } from '@/features/config/bindings'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('adoptStarter', () => {
  it('adopting the building starter publishes one version per bundle member with upstream id and version', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const r = await adoptStarter(handle.db, admin, 'nh.starter.building', signal)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(r.value.versionIds).toHaveLength(10)
    const rows = await handle.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.upstreamTemplateId, 'nh.starter.building'))
    expect(rows).toHaveLength(10)
    expect(rows.every((x) => x.status === 'published' && x.upstreamTemplateVersion === 2)).toBe(
      true,
    )
    expect(new Set(rows.map((x) => x.kind))).toEqual(
      new Set([
        'form',
        'fee_schedule',
        'condition_library',
        'inspection_checklist',
        'template',
        'application_type',
      ]),
    )
    expect((await pinCurrent(handle.db, 'BP', signal)).ok).toBe(true)
  })

  it('adopting twice is already_adopted', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await adoptStarter(handle.db, admin, 'nh.starter.building', signal)
    expect(await adoptStarter(handle.db, admin, 'nh.starter.building', signal)).toEqual({
      ok: false,
      error: 'already_adopted',
    })
    const rows = await handle.db
      .select()
      .from(configVersions)
      .where(and(eq(configVersions.kind, 'application_type'), eq(configVersions.key, 'BP')))
    expect(rows).toHaveLength(1)
  })

  it('every starter passes publish checks', async () => {
    const admin = await staffActor(handle.db, 'admin')
    for (const s of NH_STARTERS) {
      const r = await adoptStarter(handle.db, admin, s.id, signal)
      if (!r.ok) throw new Error(`${s.id}: ${JSON.stringify(r.error)}`)
      expect((await pinCurrent(handle.db, s.applicationType.key, signal)).ok).toBe(true)
    }
  })

  it('staff without config.edit is forbidden and nothing is published', async () => {
    const staff = await staffActor(handle.db, 'staff')
    expect(await adoptStarter(handle.db, staff, 'nh.starter.building', signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await handle.db.select().from(configVersions)).toHaveLength(0)
  })

  it('an unknown starter id is rejected', async () => {
    const admin = await staffActor(handle.db, 'admin')
    expect(await adoptStarter(handle.db, admin, 'nh.starter.nope', signal)).toEqual({
      ok: false,
      error: 'unknown_starter',
    })
  })
})
