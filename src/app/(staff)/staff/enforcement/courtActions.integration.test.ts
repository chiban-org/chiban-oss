import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { orderCourtSteps } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { FULL_RANGE, useEnforcementClock } from '@/test/enforcementCases'
import {
  completeService,
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  setupEnforcementWorld,
  uploadProof,
} from '@/test/enforcementFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { COURT_DOCUMENT_MESSAGE } from './serviceInputs'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./serviceActions')

const h = actionHarness()
h.useObjectStore()
useEnforcementClock()
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const served = lazy<IssuedOrder>(async () => {
  const order = await issuedOrder(h.db, h.store, world, { location: '71 Spruce Street' })
  return await completeService(h.db, h.store, world, order, '2027-03-01')
})

const courtDocument = async () =>
  await uploadProof(
    h.db,
    h.store,
    world.staff,
    (await served()).caseId,
    'Court filing',
    'court_document',
  )

const courtFields = async (overrides: Record<string, string> = {}) => ({
  orderId: (await served()).orderId,
  kind: 'filed_with_clerk',
  occurredOn: '2027-03-10',
  court: 'District Court, Alder Pond Division',
  docket: '2027-CV-0042',
  documentId: await courtDocument(),
  judgmentOutcome: '',
  ...overrides,
})

function courtRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'orderId':
      return refuseField('orderId', idMessage('an order'))
    case 'kind':
      return refuseField('kind', 'Choose a step.')
    case 'occurredOn':
      return refuseField('occurredOn', dateMessage('the date of the step', variant))
    case 'court':
      return refuseField('court', textMessage('the court', 200, variant))
    case 'docket':
      return refuseField('docket', textMessage('the docket number', 100, variant))
    case 'documentId':
      return refuseField('documentId', COURT_DOCUMENT_MESSAGE)
    default:
      return refuseField('judgmentOutcome', 'Choose a judgment result.')
  }
}

describeActionCases(h, 'courtStepAction', {
  invoke: actions.courtStepAction,
  actor: () => world.staff,
  input: () => courtFields(),
  fields: {
    orderId: uuid({ required: true }),
    kind: choice({ required: true }),
    occurredOn: date({ required: true, ...FULL_RANGE }),
    court: text({ required: true, max: 200 }),
    docket: text({ max: 100 }),
    documentId: uuid({ required: true }),
    judgmentOutcome: choice(),
  },
  capability: 'enforcement.record_service',
  refusals: { ...STAFF_REFUSALS, invalid: courtRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Court step recorded.' })
    const rows = await db
      .select({ kind: orderCourtSteps.kind, occurredOn: orderCourtSteps.occurredOn })
      .from(orderCourtSteps)
      .where(eq(orderCourtSteps.orderId, (await served()).orderId))
    expect(rows).toEqual([{ kind: 'filed_with_clerk', occurredOn: '2027-03-10' }])
  },
})

describe('courtStepAction refusals beside their fields', () => {
  async function refusedWith(overrides: Record<string, string>) {
    h.signIn(world.staff)
    const form = h.form(await courtFields(overrides))
    return await h.recordWrites(() => actions.courtStepAction(form))
  }

  it('refuses a judgment with no result beside the judgment result', async () => {
    expect(await refusedWith({ kind: 'judgment' })).toEqual({
      value: refuseField('judgmentOutcome', 'Choose the judgment result.'),
      written: [],
    })
  })

  it('refuses a result on a step that is not a judgment beside the judgment result', async () => {
    expect(await refusedWith({ judgmentOutcome: 'affirmed' })).toEqual({
      value: refuseField(
        'judgmentOutcome',
        'Choose Not a judgment unless this step is a judgment.',
      ),
      written: [],
    })
  })

  it('refuses a step dated in the future beside the date', async () => {
    expect(await refusedWith({ occurredOn: '2099-01-01' })).toEqual({
      value: refuseField('occurredOn', 'The date cannot be in the future.'),
      written: [],
    })
  })

  it('refuses a document that is not a court document beside the document', async () => {
    const proof = await uploadProof(h.db, h.store, world.staff, (await served()).caseId)
    const { value, written } = await refusedWith({ documentId: proof })
    expect(written).toEqual([])
    expect(value).toMatchObject({ ok: false, fieldErrors: { documentId: expect.any(String) } })
  })

  it('refuses a filing for an order whose service is not complete, in words', async () => {
    h.signIn(world.staff)
    const unserved = await issuedOrder(h.db, h.store, world, { location: '72 Spruce Street' })
    const documentId = await uploadProof(
      h.db,
      h.store,
      world.staff,
      unserved.caseId,
      'Court filing',
      'court_document',
    )
    const result = await actions.courtStepAction(
      h.form(await courtFields({ orderId: unserved.orderId, documentId })),
    )
    expect(result).toEqual({
      ok: false,
      error:
        'Every required recipient must be served, with proof, before the order is filed with the clerk.',
    })
  })
})
