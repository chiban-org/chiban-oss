import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { gisLayers } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { configureLayer, fixtureFetch, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld } from '@/test/parcels'
import { wholeNumberCopy } from '@/test/recordsCases'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  int,
  STAFF_REFUSALS,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
const LAYER_URL = 'https://gis.alderpond.example/arcgis/rest/services/Parcels/FeatureServer/0'

beforeAll(async () => {
  await seedParcelWorld(h.db)
})
afterAll(() => {
  vi.unstubAllGlobals()
})

const settings = (patch: Record<string, string> = {}) => ({
  key: 'parcels',
  adapter: 'esri_rest',
  sourceUrl: LAYER_URL,
  mapping: JSON.stringify(PARCEL_MAPPING),
  staleAfterDays: '60',
  refreshIntervalHours: '12',
  ...patch,
})

describeActionCases(h, 'updateLayerSettingsAction', {
  invoke: actions.updateLayerSettingsAction,
  actor: () => h.actorFor('admin'),
  input: () => settings(),
  fields: {
    key: choice({ required: true }),
    adapter: choice(),
    sourceUrl: text({ max: 2000 }),
    mapping: text({ max: 200_000 }),
    staleAfterDays: int({ required: true, min: 1, max: 3650 }),
    refreshIntervalHours: int({ required: true, min: 1, max: 720 }),
  },
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      key: 'Choose a layer.',
      adapter: 'Choose an adapter.',
      sourceUrl: 'Enter the source address of 2000 characters or fewer.',
      mapping: 'Enter a mapping of 200000 characters or fewer.',
      staleAfterDays: wholeNumberCopy('the days before data is stale', 1, 3650),
      refreshIntervalHours: wholeNumberCopy('the hours between refreshes', 1, 720),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Layer settings saved.' })
    expect(written).toEqual(['audit_log', 'gis_layers'])
    const rows = await db.select().from(gisLayers)
    expect(rows.find((r) => r.key === 'parcels')).toMatchObject({
      adapter: 'esri_rest',
      staleAfterDays: 60,
      refreshIntervalHours: 12,
    })
  },
})

describe('updateLayerSettingsAction mapping and address', () => {
  const attempt = async (patch: Record<string, string>) => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form(settings(patch))
    return await h.recordWrites(() => actions.updateLayerSettingsAction(form))
  }

  it('says a mapping that does not fit the layer is wrong beside the mapping', async () => {
    const { value, written } = await attempt({ mapping: '{"primaryId":{"field":"X"}}' })
    expect(value).toEqual(refuseField('mapping', 'The mapping is not valid JSON for this layer.'))
    expect(written).toEqual([])
  })

  it('refuses a source address that is not a web address, beside the address', async () => {
    expect((await attempt({ sourceUrl: 'not a url' })).value).toEqual(
      refuseField('sourceUrl', 'Enter the source address starting with https://.'),
    )
  })

  it('accepts a blank adapter and address for a layer that is filled from files', async () => {
    expect((await attempt({ adapter: '', sourceUrl: '' })).value).toEqual({
      ok: true,
      message: 'Layer settings saved.',
    })
  })
})

describeActionCases(h, 'runLayerRefreshAction', {
  invoke: async (form) => {
    await configureLayer(h.db, 'parcels', PARCEL_MAPPING, {
      adapter: 'esri_rest',
      sourceUrl: LAYER_URL,
    })
    vi.stubGlobal('fetch', fixtureFetch('esri').fetch)
    return await actions.runLayerRefreshAction(form)
  },
  actor: () => h.actorFor('staff'),
  input: () => ({ key: 'parcels' }),
  fields: { key: choice({ required: true }) },
  capability: 'gis.import',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ key: 'Choose a layer.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining('Imported 36 rows') })
    expect(written).toContain('import_runs')
  },
})
