import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { appealNodes } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage } from '@/test/boardCases'
import { BOARD_FIXTURE_NOW, setupBoardWorld } from '@/test/boardFixtures'
import { decidedZba } from '@/test/hearingFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const { addAppealNodeAction } = await import('./decisionActions')

const h = actionHarness()
h.useObjectStore()

let parentId = ''
let applicationId = ''

beforeAll(async () => {
  const world = await setupBoardWorld(h.db, { zbaMeetings: ['2027-04-15'] })
  const decided = await decidedZba(h.db, world, h.store, { documents: false })
  applicationId = decided.applicationId
  const [node] = await h.db
    .select({ id: appealNodes.id })
    .from(appealNodes)
    .where(eq(appealNodes.decisionId, decided.decisionId))
  parentId = node?.id ?? ''
  vi.useFakeTimers({ toFake: ['Date'], now: BOARD_FIXTURE_NOW })
})
afterAll(() => {
  vi.useRealTimers()
})

function refusalFor(variant: InvalidVariant) {
  switch (variant.field) {
    case 'parentId':
      return refuseField('parentId', idMessage('the step it follows'))
    case 'kind':
      return refuseField('kind', 'Choose a step.')
    case 'occurredOn':
      return refuseField('occurredOn', dateMessage('the date of the step', variant))
    case 'outcome':
      return refuseField('outcome', 'Choose a result.')
    default:
      return refuseField('linked', 'Choose whether it is a linked component.')
  }
}

describeActionCases(h, 'addAppealNodeAction', {
  invoke: addAppealNodeAction,
  actor: () => h.actorFor('admin'),
  input: () => ({
    parentId,
    kind: 'rehearing_motion',
    occurredOn: '2027-05-10',
    outcome: '',
    linked: 'no',
  }),
  fields: {
    parentId: uuid({ required: true }),
    kind: choice({ required: true }),
    occurredOn: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
    outcome: choice(),
    linked: choice({ required: true }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Recorded on the appeal graph.' })
    expect(written).toContain('appeal_nodes')
    const nodes = await db
      .select({ kind: appealNodes.kind, occurredOn: appealNodes.occurredOn })
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, applicationId))
    expect(nodes).toContainEqual({ kind: 'rehearing_motion', occurredOn: '2027-05-10' })
  },
})

describe('addAppealNodeAction with the step dates from the forms sweep', () => {
  it('refuses a step dated before the decision it follows beside the Date field and records nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({
      parentId,
      kind: 'rehearing_motion',
      occurredOn: '2020-01-01',
      outcome: '',
      linked: 'no',
    })
    const { value, written } = await h.recordWrites(() => addAppealNodeAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('occurredOn', 'The date cannot be before the step it follows.'),
      written: [],
    })
  })

  it('refuses a step dated after today beside the Date field', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({
      parentId,
      kind: 'rehearing_motion',
      occurredOn: '2028-06-01',
      outcome: '',
      linked: 'no',
    })
    expect(await addAppealNodeAction(form)).toEqual(
      refuseField('occurredOn', 'The date cannot be in the future.'),
    )
  })
})
