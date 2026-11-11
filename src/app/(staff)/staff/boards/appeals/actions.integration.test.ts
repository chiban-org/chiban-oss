import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { appealNodes, applications } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { dateMessage, textMessage } from '@/test/boardCases'
import {
  actionHarness,
  date,
  describeActionCases,
  type InvalidVariant,
  redirectsTo,
  STAFF_REFUSALS,
  settle,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { recordAdministrativeDecisionAction } = await import('./actions')
const { addAppealNodeAction } = await import('../hearings/decisionActions')

const h = actionHarness()

let world: PermitWorld
let permit = { applicationId: '', number: '' }

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
  permit = await makeApplication(h.db, world, { state: 'issued' })
})

function refusalFor(variant: InvalidVariant) {
  return variant.field === 'occurredOn'
    ? refuseField('occurredOn', dateMessage('the date of the decision', variant))
    : refuseField(
        'applicationNumber',
        textMessage('the application or permit number', 100, variant),
      )
}

describeActionCases(h, 'recordAdministrativeDecisionAction', {
  invoke: recordAdministrativeDecisionAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ applicationNumber: permit.number, occurredOn: '2026-01-05' }),
  fields: {
    applicationNumber: text({ required: true, max: 100 }),
    occurredOn: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  ignoreWrites: ['clocks'],
  accepted: async (result, { db, written }) => {
    expect(result).toEqual(redirectsTo(`/staff/boards/appeals/${permit.applicationId}`))
    expect(written).toEqual(['appeal_nodes', 'audit_log'])
    const nodes = await db
      .select()
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, permit.applicationId))
    expect(nodes.some((n) => n.kind === 'administrative_decision')).toBe(true)
  },
})

describe('recordAdministrativeDecisionAction refusals beside the field', () => {
  it('says no application has that number', async () => {
    h.signIn(await h.actorFor('staff'))
    expect(
      await recordAdministrativeDecisionAction(
        h.form({ applicationNumber: 'BP-1999-0000', occurredOn: '2026-01-05' }),
      ),
    ).toEqual(refuseField('applicationNumber', 'No application or permit has that number.'))
  })

  it('refuses a decision dated after today beside the date', async () => {
    h.signIn(await h.actorFor('staff'))
    expect(
      await recordAdministrativeDecisionAction(
        h.form({ applicationNumber: permit.number, occurredOn: '2099-01-05' }),
      ),
    ).toEqual(refuseField('occurredOn', 'The date cannot be in the future.'))
  })
})

describe('starting the appeal to the Zoning Board', () => {
  it('records the appeal with the appellant and suspends the issued permit', async () => {
    const appealed = await makeApplication(h.db, world, { state: 'issued' })
    h.signIn(await h.actorFor('staff'))
    await settle(
      recordAdministrativeDecisionAction(
        h.form({ applicationNumber: appealed.number, occurredOn: '2026-01-05' }),
      ),
    )
    const [root] = await h.db
      .select()
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, appealed.applicationId))
    const result = await addAppealNodeAction(
      h.form({
        parentId: root?.id ?? '',
        kind: 'zba_appeal',
        occurredOn: '2026-01-20',
        outcome: '',
        linked: 'no',
        appellantName: 'Lee Abbott',
      }),
    )
    expect(result).toEqual({ ok: true, message: 'Recorded on the appeal graph.' })
    const [app] = await h.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, appealed.applicationId))
    expect(app?.state).toBe('suspended')
  })
})
