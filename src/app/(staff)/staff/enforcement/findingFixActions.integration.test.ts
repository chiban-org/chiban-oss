import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { violationFindings } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { caseWithFinding } from '@/test/enforcementActionFixtures'
import { PAST_ONLY, pastDateMessage, useEnforcementClock } from '@/test/enforcementCases'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
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

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./findingFixActions')

const h = actionHarness()
useEnforcementClock()
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

async function findingRow(findingId: string) {
  const [row] = await h.db
    .select()
    .from(violationFindings)
    .where(eq(violationFindings.id, findingId))
  return row
}

const forEdit = lazy(() => caseWithFinding(h.db, world, '31 Birch Lane'))

function editRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'findingId':
      return refuseField('findingId', idMessage('a finding'))
    case 'provisionKind':
      return refuseField('provisionKind', 'Choose what was violated.')
    case 'provisionRef':
      return refuseField('provisionRef', textMessage('the section or condition', 300, variant))
    case 'facts':
      return refuseField('facts', textMessage('the facts', 5000, variant))
    default:
      return refuseField('inspectionDate', pastDateMessage('the inspection date', variant))
  }
}

describeActionCases(h, 'editFindingAction', {
  invoke: actions.editFindingAction,
  actor: () => world.staff,
  input: async () => ({
    findingId: (await forEdit()).findingId,
    provisionKind: 'building_code',
    provisionRef: 'IRC 2021 Section R105.1, work without a required permit',
    facts: 'The garage has no building permit.',
    inspectionDate: '2027-07-02',
  }),
  fields: {
    findingId: uuid({ required: true }),
    provisionKind: choice({ required: true }),
    provisionRef: text({ required: true, max: 300 }),
    facts: text({ required: true, max: 5000 }),
    inspectionDate: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: editRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result) => {
    expect(result).toEqual({ ok: true, message: 'Finding saved.' })
    expect((await findingRow((await forEdit()).findingId))?.provisionKind).toBe('building_code')
  },
})

const forWithdraw = lazy(() => caseWithFinding(h.db, world, '32 Birch Lane'))

describeActionCases(h, 'withdrawFindingAction', {
  invoke: actions.withdrawFindingAction,
  actor: () => world.staff,
  input: async () => ({
    findingId: (await forWithdraw()).findingId,
    reason: 'Recorded on the wrong lot.',
  }),
  fields: {
    findingId: uuid({ required: true }),
    reason: text({ required: true, max: 1000 }),
  },
  capability: 'enforcement.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant: InvalidVariant) =>
      variant.field === 'findingId'
        ? refuseField('findingId', idMessage('a finding'))
        : refuseField('reason', textMessage('the reason for withdrawing it', 1000, variant)),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result) => {
    expect(result).toEqual({
      ok: true,
      message:
        'Finding withdrawn. Every finding is withdrawn, so the case is back under investigation.',
    })
    expect((await findingRow((await forWithdraw()).findingId))?.status).toBe('withdrawn')
  },
})

const forCorrected = lazy(() => caseWithFinding(h.db, world, '33 Birch Lane'))

describeActionCases(h, 'markFindingCorrectedAction', {
  invoke: actions.markFindingCorrectedAction,
  actor: () => world.staff,
  input: async () => ({
    findingId: (await forCorrected()).findingId,
    correctedOn: '2027-07-10',
    note: 'The garage was removed.',
  }),
  fields: {
    findingId: uuid({ required: true }),
    correctedOn: date({ required: true, ...PAST_ONLY }),
    note: text({ required: false, max: 1000 }),
  },
  capability: 'enforcement.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant: InvalidVariant) => {
      if (variant.field === 'findingId') return refuseField('findingId', idMessage('a finding'))
      if (variant.field === 'note') return refuseField('note', textMessage('a note', 1000, variant))
      return refuseField('correctedOn', pastDateMessage('the date corrected', variant))
    },
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result) => {
    expect(result).toEqual({ ok: true, message: 'Finding marked corrected.' })
    expect(await findingRow((await forCorrected()).findingId)).toMatchObject({
      status: 'corrected',
      correctedOn: '2027-07-10',
      correctedNote: 'The garage was removed.',
    })
  },
})
