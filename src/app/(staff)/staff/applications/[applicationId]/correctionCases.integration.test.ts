import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CheckOutcome } from '@/components/permits/useCorrectionCheck'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import type { PermitWorld } from '@/test/applicationFixtures'
import { type IssuedPermit, issuedTradePermit } from '@/test/correctionFixtures'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import type { Refusals } from '@/test/testHarness/actions/cases'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const { checkCorrectionAction, correctPermitAction } = await import('./correctionActions')

const h = actionHarness()
h.useObjectStore()
let world: PermitWorld
let permit: IssuedPermit

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
  permit = await issuedTradePermit(h.db, world, h.store)
})

const VALUES = JSON.stringify({ description: 'Panel upgrade', contractor_license_number: 'EL-2' })
const applicationId = () => permit.trade.applicationId

describeActionCases(h, 'correctPermitAction', {
  invoke: correctPermitAction,
  actor: () => h.actorFor('staff'),
  input: () => ({
    applicationId: applicationId(),
    values: VALUES,
    contractor: 'keep',
    projectTitle: 'Garage addition',
    reason: 'License number was mistyped',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    projectTitle: text({ required: true, max: 200 }),
    reason: text({ required: true, max: 2000 }),
  },
  capability: ['application.amend_after_review', 'permit.issue'],
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      projectTitle: {
        missing: 'Enter the project title.',
        whitespace: 'Enter the project title.',
        otherwise: 'Enter the project title of 200 characters or fewer.',
      },
      reason: {
        missing: 'Enter the reason for the correction.',
        whitespace: 'Enter the reason for the correction.',
        otherwise: 'Enter the reason for the correction of 2000 characters or fewer.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result) => {
    expect(result).toEqual({ ok: true, message: 'Permit reissued as revision 1.' })
  },
})

describeActionCases(h, 'checkCorrectionAction', {
  invoke: checkCorrectionAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ applicationId: applicationId(), values: VALUES, contractor: 'keep' }),
  fields: { applicationId: uuid({ required: true }) },
  capability: ['application.amend_after_review', 'permit.issue'],
  refusals: {
    ...(STAFF_REFUSALS as unknown as Refusals<CheckOutcome>),
    invalid: { ok: false, error: 'Choose an application.' },
  },
  accepted: (result) => {
    expect(result).toMatchObject({ ok: true, feeLine: 'No fee changes', refusal: null })
  },
})

describe('correction sweep findings', () => {
  it('names the reason field when the reason is spaces and the title field when it is blank', async () => {
    h.signIn(await h.actorFor('staff'))
    const base = { applicationId: applicationId(), values: VALUES, contractor: 'keep' }
    expect(
      await correctPermitAction(h.form({ ...base, projectTitle: 'Garage', reason: '   ' })),
    ).toEqual(refuseField('reason', 'Enter the reason for the correction.'))
    expect(
      await correctPermitAction(h.form({ ...base, projectTitle: ' ', reason: 'Typo fix here' })),
    ).toEqual(refuseField('projectTitle', 'Enter the project title.'))
  })

  it('names the contractor name field when a new contractor has no name', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await correctPermitAction(
      h.form({
        applicationId: applicationId(),
        values: VALUES,
        contractor: 'new',
        contractorName: '',
        projectTitle: 'Garage',
        reason: 'New contractor took over',
      }),
    )
    expect(result).toEqual(refuseField('contractorName', "Enter the new contractor's name."))
  })
})
