import { beforeAll, describe, expect, it, vi } from 'vitest'
import { applyCondition } from '@/features/conditions/applicationConditions'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  money,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { applyConditionAction, setConditionStatusAction } = await import('./conditionActions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const underReview = async () => (await applicationIn(h.db, world, 'under_review')).applicationId
const CODE_COPY = {
  missing: 'Enter a condition.',
  whitespace: 'Enter a condition.',
  otherwise: 'Enter a condition of 200 characters or fewer.',
}

describeActionCases(h, 'applyConditionAction', {
  invoke: applyConditionAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ applicationId: await underReview(), code: 'SEPTIC' }),
  fields: { applicationId: uuid({ required: true }), code: text({ required: true, max: 200 }) },
  capability: 'permit.issue',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ applicationId: 'Choose an application.', code: CODE_COPY }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Condition applied.' })
    expect(written).toEqual(['application_conditions', 'audit_log'])
  },
})

describeActionCases(h, 'setConditionStatusAction', {
  invoke: setConditionStatusAction,
  actor: () => h.actorFor('staff'),
  input: async () => {
    const applicationId = await underReview()
    const staff = await h.actorFor('staff')
    const applied = await applyCondition(
      h.db,
      staff,
      { applicationId, code: 'SEPTIC' },
      new AbortController().signal,
    )
    return { conditionId: applied.ok ? applied.value.conditionId : '', status: 'met' }
  },
  fields: {
    conditionId: uuid({ required: true }),
    status: choice({ required: true }),
    reason: text({ max: 2000 }),
  },
  capability: 'permit.issue',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      conditionId: 'Choose a condition.',
      status: 'Choose a status.',
      reason: 'Enter a reason of 2000 characters or fewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Condition updated.' })
    expect(written).toEqual(['application_conditions', 'audit_log'])
  },
})

describe('the sweep findings on conditions', () => {
  it('refuses a condition already on the application beside the Condition field', async () => {
    const staff = await h.actorFor('staff')
    h.signIn(staff)
    const applicationId = await underReview()
    const form = () => h.form({ applicationId, code: 'SEPTIC' })
    expect(await applyConditionAction(form())).toEqual({ ok: true, message: 'Condition applied.' })
    const second = await h.recordWrites(() => applyConditionAction(form()))
    expect(second).toEqual({
      value: refuseField('code', 'That condition is already on this application.'),
      written: [],
    })
  })

  it('refuses a condition that is not in the library beside the Condition field', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await applyConditionAction(
      h.form({ applicationId: await underReview(), code: 'NOT-IN-LIBRARY' }),
    )
    expect(result).toEqual(
      refuseField('code', "That condition is not in the application's condition library."),
    )
  })

  it('asks for a reason of at least 10 characters when waiving a blocking condition', async () => {
    const staff = await h.actorFor('staff')
    h.signIn(staff)
    const applicationId = await underReview()
    const applied = await applyCondition(
      h.db,
      staff,
      { applicationId, code: 'SEPTIC' },
      new AbortController().signal,
    )
    const conditionId = applied.ok ? applied.value.conditionId : ''
    const result = await setConditionStatusAction(
      h.form({ conditionId, status: 'waived', reason: 'short' }),
    )
    expect(result).toEqual(refuseField('reason', 'Enter a reason of at least 10 characters.'))
  })
})
