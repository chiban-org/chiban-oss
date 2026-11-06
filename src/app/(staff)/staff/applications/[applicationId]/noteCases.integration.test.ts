import { beforeAll, describe, expect, it, vi } from 'vitest'
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

const { addApplicationNoteAction } = await import('./notesActions')
const { setResponsibleStaffAction } = await import('./responsibleActions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const submitted = async () => (await applicationIn(h.db, world, 'submitted')).applicationId
const NOT_STAFF =
  'Choose an active town staff member. Reviewers and applicants cannot be responsible.'

describeActionCases(h, 'addApplicationNoteAction', {
  invoke: addApplicationNoteAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await submitted(),
    body: 'Asked the owner for the design.',
  }),
  fields: { applicationId: uuid({ required: true }), body: text({ required: true, max: 5000 }) },
  capability: 'application.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      body: {
        missing: 'Enter a note.',
        whitespace: 'Enter a note.',
        otherwise: 'Enter a note of 5000 characters or fewer.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Note added.' })
    expect(written).toEqual(['application_notes', 'audit_log'])
  },
})

describeActionCases(h, 'setResponsibleStaffAction', {
  invoke: setResponsibleStaffAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await submitted(),
    userId: (await h.actorFor('staff')).userId,
  }),
  fields: { applicationId: uuid({ required: true }), userId: uuid() },
  capability: 'application.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ applicationId: 'Choose an application.', userId: NOT_STAFF }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Responsible staff member saved.' })
    expect(written).toEqual(['applications', 'audit_log'])
  },
})

describe('notes and responsibility', () => {
  it('refuses a reviewer as the responsible staff member beside the field', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await setResponsibleStaffAction(
      h.form({ applicationId: await submitted(), userId: (await h.actorFor('reviewer')).userId }),
    )
    expect(result).toEqual(refuseField('userId', NOT_STAFF))
  })

  it('clears the responsible staff member when Nobody is chosen', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await setResponsibleStaffAction(
      h.form({ applicationId: await submitted(), userId: '' }),
    )
    expect(result).toEqual({ ok: true, message: 'Responsible staff member saved.' })
  })

  it('takes the first note on an application', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await addApplicationNoteAction(
      h.form({ applicationId: await submitted(), body: '  First note  ' }),
    )
    expect(result).toEqual({ ok: true, message: 'Note added.' })
  })
})
