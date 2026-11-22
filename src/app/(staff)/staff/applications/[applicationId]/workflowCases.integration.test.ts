import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { appealNodes, applications, documents } from '@/db/schema'
import { STAFF_DECISION_LETTER_TITLE } from '@/features/applications/staffDecision'
import { CHECK_PASSED } from '@/server/formInput'
import { applicationIn, type CaseApplication } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  int,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const { transitionAction, setSubstepAction } = await import('./actions')

const h = actionHarness()
h.useObjectStore()
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
  await saveAndPublish(
    h.db,
    world.admin,
    'application_type',
    'BP',
    appTypeBody({
      workflow: {
        allowsDirectIssue: false,
        closesOn: 'certificate_of_occupancy',
        substeps: [{ state: 'under_review', key: 'plan_review', label: 'Plan review' }],
      },
    }),
  )
})

const VERSION_COPY = {
  missing: 'Enter the version of the application.',
  otherwise: 'Enter the version of the application as a whole number from 1 to 2147483647.',
}

function stepOf(application: CaseApplication) {
  return {
    applicationId: application.applicationId,
    expectedRowVersion: String(application.rowVersion),
  }
}

describeActionCases(h, 'transitionAction', {
  invoke: transitionAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    ...stepOf(await applicationIn(h.db, world, 'submitted')),
    to: 'under_review',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    to: choice({ required: true }),
    expectedRowVersion: int({ required: true, min: 1, max: 2_147_483_647 }),
    reason: text({ max: 2000 }),
  },
  capability: 'application.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      to: 'Choose a step.',
      expectedRowVersion: VERSION_COPY,
      reason: {
        otherwise: 'Enter a reason for the denial of 2000 characters or fewer.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Moved to under review.' })
    expect(written).toEqual(['applications', 'audit_log'])
  },
})

describeActionCases(h, 'setSubstepAction', {
  invoke: setSubstepAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    ...stepOf(await applicationIn(h.db, world, 'under_review')),
    substep: 'plan_review',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    substep: text({ required: true, max: 200 }),
    expectedRowVersion: int({ required: true, min: 1, max: 2_147_483_647 }),
  },
  capability: 'application.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      substep: {
        missing: 'Enter a step.',
        whitespace: 'Enter a step.',
        otherwise: 'Enter a step of 200 characters or fewer.',
      },
      expectedRowVersion: VERSION_COPY,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Step updated.' })
    expect(written).toEqual(['applications', 'audit_log'])
  },
})

describe('a staff denial from the work plan', () => {
  async function deny(reason: string | null) {
    const app = await applicationIn(h.db, world, 'under_review')
    h.signIn(await h.actorFor('staff'))
    const result = await transitionAction(
      h.form({ ...stepOf(app), to: 'denied', ...(reason === null ? {} : { reason }) }),
    )
    const letters = await h.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.recordId, app.applicationId),
          eq(documents.title, STAFF_DECISION_LETTER_TITLE),
        ),
      )
    const nodes = await h.db
      .select({ outcome: appealNodes.outcome })
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, app.applicationId))
    const [row] = await h.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    return { result, letters: letters.length, nodes, state: row?.state }
  }

  it('refuses a denial with no reason on the reason field', async () => {
    const denied = await deny(null)
    expect(denied.result).toEqual({
      ok: false,
      error: 'Enter a reason for the denial of at least 10 characters.',
      fieldErrors: { reason: 'Enter a reason for the denial of at least 10 characters.' },
    })
    expect(denied).toMatchObject({ letters: 0, nodes: [], state: 'under_review' })
  })

  it('denies with a reason, attaches the letter and adds the appeals register entry', async () => {
    const denied = await deny('The porch sits inside the front setback.')
    expect(denied.result).toEqual({ ok: true, message: 'Denied. The decision letter is attached.' })
    expect(denied).toMatchObject({ letters: 1, nodes: [{ outcome: 'denied' }], state: 'denied' })
  })
})
