import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { CHECK_PASSED } from '@/server/formInput'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  describeActionCases,
  STAFF_REFUSALS,
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

const { amendApplicationAction } = await import('./amendActions')

const h = actionHarness()
h.useObjectStore()
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const underReview = async () =>
  (await applicationIn(h.db, world, 'under_review', { values: { classification: 'residential' } }))
    .applicationId

const VALUES = JSON.stringify({ classification: 'nonresidential' })

describeActionCases(h, 'amendApplicationAction', {
  invoke: amendApplicationAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ applicationId: await underReview(), values: VALUES }),
  fields: { applicationId: uuid({ required: true }) },
  capability: 'application.amend_after_review',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ applicationId: 'Choose an application.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result) => {
    expect(result).toEqual({ ok: true, message: 'Application updated.' })
  },
})

describe('editing an application from the staff page', () => {
  it('saves the new answers', async () => {
    h.signIn(await h.actorFor('staff'))
    const applicationId = await underReview()
    expect(await amendApplicationAction(h.form({ applicationId, values: VALUES }))).toEqual({
      ok: true,
      message: 'Application updated.',
    })
    const [row] = await h.db
      .select({ values: applications.values })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(row?.values).toEqual({ classification: 'nonresidential' })
  })

  it('names each refused answer beside its question', async () => {
    h.signIn(await h.actorFor('staff'))
    const applicationId = await underReview()
    const result = await amendApplicationAction(
      h.form({ applicationId, values: JSON.stringify({ classification: '' }) }),
    )
    expect(result).toMatchObject({
      ok: false,
      error: 'Check the highlighted answers.',
      fieldErrors: { classification: expect.any(String) },
    })
  })

  it('refuses answers that are not a set of answers', async () => {
    h.signIn(await h.actorFor('staff'))
    const applicationId = await underReview()
    expect(await amendApplicationAction(h.form({ applicationId, values: '[1, 2]' }))).toMatchObject(
      { ok: false },
    )
  })

  it('refuses once the application has been decided', async () => {
    h.signIn(await h.actorFor('staff'))
    const { applicationId } = await applicationIn(h.db, world, 'closed')
    expect(await amendApplicationAction(h.form({ applicationId, values: VALUES }))).toEqual({
      ok: false,
      error: 'Only a submitted application or one under review can be edited. Reload the page.',
    })
  })
})
