import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { runImport } from '@/features/gis/import/runImport'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { configureLayer, loadGeoJsonFixture } from '@/test/gisFixtures'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  describeActionCases,
  type Refusals,
  STAFF_REFUSALS,
  text,
} from '@/test/testHarness/actions'
import { fixture, PARCEL_MAPPING_WITHOUT_OWNER } from '@/test/testHarness/cama'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
const MAPPING = JSON.stringify(DEFAULT_CAMA_MAPPING)
const EMPTY = 'That file is empty. Choose a file with content.'
const BAD_MAPPING = 'The column mapping is not valid. Check every picker.'
const csv = () =>
  new File([new Uint8Array(fixture('alder-pond-cama.csv'))], 'owners.csv', { type: 'text/csv' })

beforeAll(async () => {
  await seedParcelWorld(h.db)
  await configureLayer(h.db, 'parcels', PARCEL_MAPPING_WITHOUT_OWNER)
  const staff = await h.actorFor('staff')
  const imported = await runImport(
    h.db,
    { kind: 'user', userId: staff.userId },
    {
      layerKey: 'parcels',
      adapter: 'file_geojson',
      features: loadGeoJsonFixture('alder-pond-parcels.geojson'),
      fullLayer: true,
    },
    signal,
  )
  if (!imported.ok) throw new Error('parcels')
})

type Plain = { ok: true } | { ok: false; error: string }
const plain = STAFF_REFUSALS as unknown as Refusals<Plain>

const plainInvalid = (error: string) => () => ({ ok: false as const, error })

describeActionCases(h, 'previewCamaAction', {
  invoke: actions.previewCamaAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ file: csv(), mapping: MAPPING }),
  fields: { mapping: text({ required: true }) },
  capability: 'gis.import',
  refusals: { ...plain, invalid: plainInvalid(BAD_MAPPING) },
  accepted: (result, { written }) => {
    expect(result).toMatchObject({ ok: true, preview: { headers: expect.any(Array) } })
    expect(written).toEqual([])
  },
})

describe('previewCamaAction file', () => {
  const attempt = async (file: File | undefined) => {
    h.signIn(await h.actorFor('staff'))
    return await actions.previewCamaAction(h.form({ file, mapping: MAPPING }))
  }

  it('says an empty file is empty', async () => {
    expect(await attempt(new File([], 'empty.csv'))).toEqual({ ok: false, error: EMPTY })
  })

  it('asks for a file when none is chosen', async () => {
    expect(await attempt(undefined)).toEqual({ ok: false, error: 'Choose a CSV file.' })
  })

  it('says a file over 50 MB is too large', async () => {
    const big = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'big.csv')
    expect(await attempt(big)).toEqual({ ok: false, error: 'That file is larger than 50 MB.' })
  })
})

describeActionCases(h, 'saveCamaMappingAction', {
  invoke: actions.saveCamaMappingAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ mapping: MAPPING }),
  fields: { mapping: text({ required: true }) },
  capability: 'gis.import',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('mapping', BAD_MAPPING),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Column mapping saved.' })
    expect(written).toContain('gis_layers')
  },
})

describe('saveCamaMappingAction mapping', () => {
  it('names a mapping that does not fit beside the mapping', async () => {
    h.signIn(await h.actorFor('staff'))
    expect(await actions.saveCamaMappingAction(h.form({ mapping: '{"encoding":"x"}' }))).toEqual(
      refuseField('mapping', BAD_MAPPING),
    )
  })
})

describeActionCases(h, 'runCamaImportAction', {
  invoke: actions.runCamaImportAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ file: csv(), mapping: MAPPING, fullLayer: 'on' }),
  fields: { mapping: text({ required: true }) },
  capability: 'gis.import',
  refusals: { ...plain, invalid: plainInvalid(BAD_MAPPING) },
  accepted: (result, { written }) => {
    expect(result).toMatchObject({ ok: true, runId: expect.any(String) })
    expect(written).toContain('import_runs')
  },
})

describe('runCamaImportAction file', () => {
  it('says an empty file is empty and imports nothing', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({ file: new File([], 'empty.csv'), mapping: MAPPING })
    const { value, written } = await h.recordWrites(() => actions.runCamaImportAction(form))
    expect(value).toEqual({ ok: false, error: EMPTY })
    expect(written).toEqual([])
  })
})
