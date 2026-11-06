import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import { overrideAdministrativeGate } from '@/features/gates/overrides'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
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

const { overrideGateAction, statutoryExceptionAction, revokeOverrideAction } = await import(
  './gateActions'
)

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const underReview = async () => (await applicationIn(h.db, world, 'under_review')).applicationId
const ADMIN_GATE = 'conditions.blocking_met'
const STATUTORY_GATE = 'nh.bp.regional_impact'
const REASON_COPY = {
  missing: 'Enter a reason.',
  whitespace: 'Enter a reason.',
  otherwise: 'Enter a reason of 2000 characters or fewer.',
}

describeActionCases(h, 'overrideGateAction', {
  invoke: overrideGateAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await underReview(),
    gateKey: ADMIN_GATE,
    reason: 'License verified by phone',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    gateKey: text({ required: true, max: 200 }),
    reason: text({ required: true, max: 2000 }),
  },
  capability: 'gate.override_admin',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      gateKey: {
        missing: 'Enter a gate.',
        whitespace: 'Enter a gate.',
        otherwise: 'Enter a gate of 200 characters or fewer.',
      },
      reason: REASON_COPY,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Gate overridden. The reason is on record.' })
    expect(written).toEqual(['audit_log', 'gate_overrides'])
  },
})

describeActionCases(h, 'statutoryExceptionAction', {
  invoke: statutoryExceptionAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    applicationId: await underReview(),
    gateKey: STATUTORY_GATE,
    citation: 'Superior Court order',
    explanation: 'Stay of review',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    gateKey: text({ required: true, max: 200 }),
    citation: text({ required: true, max: 500 }),
    explanation: text({ required: true, max: 2000 }),
  },
  capability: 'gate.record_statutory_exception',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      gateKey: {
        missing: 'Enter a gate.',
        whitespace: 'Enter a gate.',
        otherwise: 'Enter a gate of 200 characters or fewer.',
      },
      citation: {
        missing: 'Enter the legal citation.',
        whitespace: 'Enter the legal citation.',
        otherwise: 'Enter the legal citation of 500 characters or fewer.',
      },
      explanation: {
        missing: 'Enter the legal explanation.',
        whitespace: 'Enter the legal explanation.',
        otherwise: 'Enter the legal explanation of 2000 characters or fewer.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Statutory exception recorded.' })
    expect(written).toEqual(['audit_log', 'gate_overrides'])
  },
})

describeActionCases(h, 'revokeOverrideAction', {
  invoke: revokeOverrideAction,
  actor: () => h.actorFor('staff'),
  input: async () => {
    const applicationId = await underReview()
    const staff = await h.actorFor('staff')
    const signal = new AbortController().signal
    await overrideAdministrativeGate(
      h.db,
      staff,
      { applicationId, gateKey: ADMIN_GATE, reason: 'License verified by phone' },
      signal,
    )
    const [row] = (
      await h.pool.query<{ id: string }>(
        'select id from gate_overrides where application_id = $1',
        [applicationId],
      )
    ).rows
    return { overrideId: row?.id ?? '' }
  },
  fields: { overrideId: uuid({ required: true }) },
  capability: 'gate.override_admin',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ overrideId: 'Choose an override.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Override revoked.' })
    expect(written).toEqual(['audit_log', 'gate_overrides'])
  },
})

describe('overrideGateAction reasons', () => {
  const attempt = async (reason: string, extra: Record<string, string> = {}) => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({ applicationId: await underReview(), gateKey: ADMIN_GATE, reason })
    for (const [k, v] of Object.entries(extra)) form.set(k, v)
    return await h.recordWrites(() => overrideGateAction(form))
  }

  it('names the 10 character minimum beside the reason and writes nothing', async () => {
    const { value, written } = await attempt('short')
    expect(value).toEqual(refuseField('reason', 'Enter a reason of at least 10 characters.'))
    expect(written).toEqual([])
  })

  it('answers a check-only request with the same refusal so no confirm opens first', async () => {
    const { value, written } = await attempt('short', { [CHECK_ONLY_FIELD]: '1' })
    expect(value).toEqual(refuseField('reason', 'Enter a reason of at least 10 characters.'))
    expect(written).toEqual([])
  })

  it('treats spaces as an empty reason', async () => {
    expect((await attempt('          ')).value).toEqual(refuseField('reason', 'Enter a reason.'))
  })
})
