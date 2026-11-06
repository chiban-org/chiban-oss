import { beforeAll, describe, expect, it, vi } from 'vitest'
import { censusClassifications } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { wholeNumberCopy } from '@/test/recordsCases'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  int,
  STAFF_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
let world: PermitWorld
let applicationId = ''

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
  applicationId = (await makeApplication(h.db, world)).applicationId
})

const SINGLE = {
  category: 'single_family',
  excludedReason: '',
  phase: 'whole_building',
  buildings: '1',
  housingUnits: '1',
  valuationDollars: '350000',
}

describeActionCases(h, 'classifyCensusAction', {
  invoke: actions.classifyCensusAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ applicationId, ...SINGLE }),
  fields: {
    applicationId: uuid({ required: true }),
    category: choice({ required: true }),
    excludedReason: choice(),
    phase: choice({ required: true }),
    buildings: int({ required: true, min: 0, max: 1000 }),
    housingUnits: int({ required: true, min: 0, max: 100_000 }),
    valuationDollars: int({ required: true, min: 0, max: 2_000_000_000 }),
  },
  capability: 'report.view',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      category: 'Choose a kind of structure.',
      excludedReason: 'Choose why the permit is left out of the count.',
      phase: 'Choose a phase.',
      buildings: wholeNumberCopy('the number of buildings', 0, 1000),
      housingUnits: wholeNumberCopy('the number of housing units', 0, 100_000),
      valuationDollars: wholeNumberCopy('the valuation in whole dollars', 0, 2_000_000_000),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Classification saved.' })
    expect(written).toEqual(['audit_log', 'census_classifications'])
    const [row] = await db.select().from(censusClassifications)
    expect(row).toMatchObject({
      category: 'single_family',
      housingUnits: 1,
      valuationDollars: 350000,
    })
  },
})

describe('classifyCensusAction counts', () => {
  const attempt = async (patch: Record<string, string>) => {
    h.signIn(await h.actorFor('staff'))
    return await actions.classifyCensusAction(h.form({ applicationId, ...SINGLE, ...patch }))
  }

  it('names the units beside the units when they do not fit the kind of structure', async () => {
    const reply = await attempt({ housingUnits: '3' })
    expect(reply).toEqual(
      refuseField(
        'housingUnits',
        'The housing units do not fit that kind of structure: one per building for a single-family house, two per building for a two-unit building, three or four per building, or five or more per building.',
      ),
    )
  })

  it('names the reason beside the reason when a permit is left out without one', async () => {
    expect(
      await attempt({
        category: 'excluded',
        buildings: '0',
        housingUnits: '0',
        valuationDollars: '0',
      }),
    ).toEqual(refuseField('excludedReason', 'Choose why the permit is left out of the count.'))
  })
})
