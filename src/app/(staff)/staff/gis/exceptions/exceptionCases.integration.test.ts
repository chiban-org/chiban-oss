import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { importExceptions, importRuns } from '@/db/schema'
import { runImport } from '@/features/gis/import/runImport'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld } from '@/test/parcels'
import { textCopy } from '@/test/recordsCases'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
let revision = 0

const importOwners = async () => {
  const staff = await h.actorFor('staff')
  revision += 1
  const [first] = features
  if (first) first.properties.OWNER = `Owner ${revision}`
  const run = await runImport(
    h.db,
    { kind: 'user', userId: staff.userId },
    { layerKey: 'parcels', adapter: 'file_geojson', features, fullLayer: true },
    signal,
  )
  if (!run.ok) throw new Error(run.error)
  const [held] = await h.db
    .select()
    .from(importExceptions)
    .where(eq(importExceptions.firstRunId, run.value.runId))
  return { runId: run.value.runId, exceptionId: held?.id ?? '' }
}

beforeAll(async () => {
  await seedParcelWorld(h.db)
  await configureLayer(h.db, 'parcels', PARCEL_MAPPING)
  await importOwners()
})

describeActionCases(h, 'acceptHeldRowAction', {
  invoke: actions.acceptHeldRowAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ exceptionId: (await importOwners()).exceptionId }),
  fields: { exceptionId: uuid({ required: true }) },
  capability: 'parcel.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ exceptionId: 'Choose an exception.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Held row applied.' })
    expect(written).toContain('import_exceptions')
    const [row] = await db
      .select()
      .from(importExceptions)
      .where(eq(importExceptions.id, input.exceptionId))
    expect(row?.status).toBe('accepted')
  },
})

describeActionCases(h, 'acceptAllOwnerChangesAction', {
  invoke: actions.acceptAllOwnerChangesAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ runId: (await importOwners()).runId }),
  fields: { runId: uuid({ required: true }) },
  capability: 'parcel.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ runId: 'Choose an import run.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Accepted 1 owner changes.' })
    expect(written).toContain('import_exceptions')
  },
})

const openException = async () => {
  const [run] = await h.db.select({ id: importRuns.id }).from(importRuns).limit(1)
  const [made] = await h.db
    .insert(importExceptions)
    .values({
      layerKey: 'parcels',
      firstRunId: run?.id ?? '',
      lastSeenRunId: run?.id ?? '',
      rowKey: crypto.randomUUID(),
      kind: 'owner_changed',
      contentHash: crypto.randomUUID(),
      payload: {},
      detail: 'Owner changed',
    })
    .returning({ id: importExceptions.id })
  return made?.id ?? ''
}

describeActionCases(h, 'dismissExceptionAction', {
  invoke: actions.dismissExceptionAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ exceptionId: await openException(), reason: 'Bad source data' }),
  fields: {
    exceptionId: uuid({ required: true }),
    reason: text({ required: true, max: 1000 }),
  },
  capability: 'parcel.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      exceptionId: 'Choose an exception.',
      reason: textCopy('a reason', 1000),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Exception dismissed.' })
    expect(written).toEqual(['audit_log', 'import_exceptions'])
    const [row] = await db
      .select()
      .from(importExceptions)
      .where(eq(importExceptions.id, input.exceptionId))
    expect(row).toMatchObject({ status: 'dismissed', dispositionReason: 'Bad source data' })
  },
})

describe('dismissExceptionAction reason', () => {
  it('asks for a reason beside the reason when it is only spaces', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({ exceptionId: await openException(), reason: '   ' })
    expect(await actions.dismissExceptionAction(form)).toEqual(
      refuseField('reason', 'Enter a reason.'),
    )
  })
})
