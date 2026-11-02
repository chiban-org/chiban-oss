import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications, configVersions } from '@/db/schema'
import type { ConfigPins } from '@/features/config/bindings'
import { inspectableTypes } from '@/features/inspections/eligibility'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type InspectionWorld,
  newIssuedPermit,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('inspectable types', () => {
  it('a checklist published before the final flag existed counts as final when its type is final', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, permit.applicationId))
    const pins = app?.configPins as ConfigPins
    for (const id of pins.checklists) {
      const [row] = await handle.db.select().from(configVersions).where(eq(configVersions.id, id))
      const { final: _flag, ...legacy } = row?.body as Record<string, unknown>
      await handle.db.update(configVersions).set({ body: legacy }).where(eq(configVersions.id, id))
    }
    const types = await inspectableTypes(handle.db, permit.applicationId, signal)
    expect(types.map((t) => [t.inspectionType, t.final])).toEqual([
      ['rough', false],
      ['final', true],
    ])
  })
})
