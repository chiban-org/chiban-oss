import { BUILDING_DEMOLITION_STARTER } from '@packs/nh/starters/buildingDemolition'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adoptStarter } from '@/features/config/adoptStarter'
import { saveDraft } from '@/features/config/store'
import { loadFormBuilderData } from '@/features/forms/formBuilderData'
import type { FormBody } from '@/features/forms/formSchema'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const FORM = BUILDING_DEMOLITION_STARTER.form
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('loadFormBuilderData', () => {
  it('freezes every key a published version used and leaves draft-only keys free', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const adopted = await adoptStarter(handle.db, admin, BUILDING_DEMOLITION_STARTER.id, signal)
    expect(adopted.ok).toBe(true)
    const withoutCost = { ...FORM, fields: FORM.fields.filter((f) => f.key !== 'estimated_cost') }
    await saveAndPublish(handle.db, admin, 'form', 'bp-form', withoutCost)
    await saveDraft(
      handle.db,
      admin,
      {
        kind: 'form',
        key: 'bp-form',
        body: {
          ...withoutCost,
          fields: [
            ...withoutCost.fields,
            { key: 'draft_only', label: 'D', type: 'text', required: false },
          ],
        },
      },
      signal,
    )
    const data = await loadFormBuilderData(handle.db, 'bp-form', signal)
    expect(data.frozenKeys).toContain('estimated_cost')
    expect(data.frozenKeys).toContain('work_type')
    expect(data.frozenKeys).not.toContain('draft_only')
  })

  it('names the fee lines of the published application types that use the form', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await adoptStarter(handle.db, admin, BUILDING_DEMOLITION_STARTER.id, signal)
    const data = await loadFormBuilderData(handle.db, 'bp-form', signal)
    const keys = new Set(data.externalUses.map((u) => u.fieldKey))
    expect([...keys].sort()).toEqual([
      'after_the_fact',
      'commercial_sq_ft',
      'finished_sq_ft',
      'unfinished_sq_ft',
    ])
    expect(data.externalUses[0]?.source).toMatch(/^Fee schedule bp-fees \(/)
    expect(await loadFormBuilderData(handle.db, 'unused-form', signal)).toEqual({
      frozenKeys: [],
      externalUses: [],
    })
  })
})
