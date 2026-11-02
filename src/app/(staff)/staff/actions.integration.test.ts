import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gisLayers, importExceptions, parcelLineageEvents } from '@/db/schema'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, PARCEL_MAPPING } from '@/test/gisFixtures'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const state = vi.hoisted(() => ({
  db: null as unknown,
  csrfCookie: 'tok' as string | null,
  actor: null as unknown,
}))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const parcelActions = await import('@/app/(staff)/staff/parcels/[parcelId]/actions')
const exceptionActions = await import('@/app/(staff)/staff/gis/exceptions/actions')
const importActions = await import('@/app/(staff)/staff/gis/imports/actions')

let handle: TestDb

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

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const ALL_ACTIONS = {
  recordLineageAction: parcelActions.recordLineageAction,
  createAliasOverrideAction: parcelActions.createAliasOverrideAction,
  carryForwardAction: parcelActions.carryForwardAction,
  resolveUnresolvedAction: parcelActions.resolveUnresolvedAction,
  acceptHeldRowAction: exceptionActions.acceptHeldRowAction,
  acceptAllOwnerChangesAction: exceptionActions.acceptAllOwnerChangesAction,
  dismissExceptionAction: exceptionActions.dismissExceptionAction,
  updateLayerSettingsAction: importActions.updateLayerSettingsAction,
}

describe('staff actions', () => {
  it.each(Object.entries(ALL_ACTIONS))('%s rejects a missing csrf token', async (_name, action) => {
    state.actor = await staffActor(handle.db, 'admin')
    const result = await action(form({}, null))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('session expired') })
  })

  it.each(Object.entries(ALL_ACTIONS))('%s rejects a signed-out caller', async (_name, action) => {
    state.actor = null
    const result = await action(form({}))
    expect(result).toMatchObject({ ok: false, error: 'Sign in to continue.' })
  })

  it('reviewer calling recordLineageAction directly gets forbidden', async () => {
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007020000000' }])
    state.actor = await staffActor(handle.db, 'reviewer')
    const result = await parcelActions.recordLineageAction(
      form({
        kind: 'subdivision',
        effectiveDate: '2020-04-12',
        effectiveBasis: 'recording',
        parents: '007020000000',
        children: '007020001000 007020002000',
      }),
    )
    expect(result).toEqual({ ok: false, error: 'You do not have permission to do this.' })
    expect(p).toBeTruthy()
    expect(await handle.db.select().from(parcelLineageEvents)).toHaveLength(0)
  })

  it('staff records a subdivision and unseen children become placeholders', async () => {
    state.actor = await staffActor(handle.db)
    const result = await parcelActions.recordLineageAction(
      form({
        kind: 'subdivision',
        effectiveDate: '2020-04-12',
        effectiveBasis: 'recording',
        reference: 'Book 1 Page 2',
        parents: '007-020-000-000',
        children: '007020001000, 007020002000',
      }),
    )
    expect(result).toEqual({ ok: true, message: 'Lineage event recorded.' })
    expect(await handle.db.select().from(parcelLineageEvents)).toHaveLength(1)
  })

  it('a parent that does not exist is named in the error', async () => {
    state.actor = await staffActor(handle.db)
    const result = await parcelActions.recordLineageAction(
      form({
        kind: 'subdivision',
        effectiveDate: '2020-04-12',
        effectiveBasis: 'recording',
        parents: '999999999999',
        children: '1 2',
      }),
    )
    expect(result).toEqual({ ok: false, error: 'No parcel found for 999999999999.' })
  })

  it('dismiss without reason is refused', async () => {
    state.actor = await staffActor(handle.db)
    const result = await exceptionActions.dismissExceptionAction(
      form({ exceptionId: '00000000-0000-4000-8000-000000000000', reason: '  ' }),
    )
    expect(result).toEqual({ ok: false, error: 'A reason is required.' })
    expect(await handle.db.select().from(importExceptions)).toHaveLength(0)
  })

  it('layer settings need config.edit: staff is refused, admin saves', async () => {
    const fields = {
      key: 'parcels',
      adapter: 'esri_rest',
      sourceUrl: 'https://gis.alderpond.example/arcgis/rest/services/Parcels/FeatureServer/0',
      mapping: JSON.stringify(PARCEL_MAPPING),
      staleAfterDays: '60',
      refreshIntervalHours: '12',
    }
    state.actor = await staffActor(handle.db)
    expect(await importActions.updateLayerSettingsAction(form(fields))).toMatchObject({ ok: false })
    state.actor = await staffActor(handle.db, 'admin')
    expect(await importActions.updateLayerSettingsAction(form(fields))).toEqual({
      ok: true,
      message: 'Layer settings saved.',
    })
    const [layer] = await handle.db.select().from(gisLayers).where(eq(gisLayers.key, 'parcels'))
    expect(layer).toMatchObject({
      adapter: 'esri_rest',
      staleAfterDays: 60,
      refreshIntervalHours: 12,
    })
  })

  it('layer settings reject a bad mapping', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    await configureLayer(handle.db, 'roads', {})
    const result = await importActions.updateLayerSettingsAction(
      form({
        key: 'parcels',
        adapter: '',
        sourceUrl: '',
        mapping: '{"primaryId":{"field":"X"}}',
        staleAfterDays: '90',
        refreshIntervalHours: '24',
      }),
    )
    expect(result).toEqual({ ok: false, error: 'The mapping is not valid JSON for this layer.' })
  })
})
