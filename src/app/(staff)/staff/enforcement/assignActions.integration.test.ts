import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { enforcementCases } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { intakeCase } from '@/test/enforcementActionFixtures'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import {
  actionHarness,
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

const { reassignCaseAction } = await import('./assignActions')

const h = actionHarness()
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const assignedTo = (caseId: string) =>
  h.db
    .select({ id: enforcementCases.assignedTo })
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
    .then((rows) => rows[0]?.id ?? null)

const forReassign = lazy(() => intakeCase(h.db, world, '3 Loon Lane'))

function reassignRefusal(variant: InvalidVariant) {
  return variant.field === 'caseId'
    ? refuseField('caseId', idMessage('a case'))
    : refuseField('userId', 'Choose someone to assign.')
}

describeActionCases(h, 'reassignCaseAction', {
  invoke: reassignCaseAction,
  actor: () => world.staff,
  input: async () => ({
    caseId: (await forReassign()).caseId,
    userId: world.inspector.userId,
  }),
  fields: { caseId: uuid({ required: true }), userId: uuid() },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: reassignRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result) => {
    expect(result).toEqual({ ok: true, message: 'Case reassigned.' })
    expect(await assignedTo((await forReassign()).caseId)).toBe(world.inspector.userId)
  },
})

describe('reassignCaseAction beyond the table', () => {
  it('unassigns the case when no one is chosen', async () => {
    h.signIn(world.staff)
    const { caseId } = await intakeCase(h.db, world, '4 Loon Lane')
    const result = await reassignCaseAction(h.form({ caseId, userId: '' }))
    expect(result).toEqual({ ok: true, message: 'Case reassigned.' })
    expect(await assignedTo(caseId)).toBeNull()
  })

  it('says why someone outside enforcement cannot take the case, beside the assignee', async () => {
    h.signIn(world.staff)
    const { caseId } = await intakeCase(h.db, world, '5 Loon Lane')
    const { value, written } = await h.recordWrites(() =>
      reassignCaseAction(h.form({ caseId, userId: world.finance.userId })),
    )
    expect({ value, written }).toEqual({
      value: refuseField('userId', 'Choose someone whose role works code enforcement cases.'),
      written: [],
    })
  })
})
