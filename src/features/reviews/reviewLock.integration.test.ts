import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CoreState } from '@/features/applications/states'
import { addReviewComment, assignReviewer, signOffReview } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function assignmentOn(state: CoreState): Promise<string> {
  const { applicationId } = await makeApplication(handle.db, world, { state })
  const assigned = await assignReviewer(
    handle.db,
    world.staff,
    { applicationId, reviewerUserId: world.reviewer.userId },
    signal,
  )
  if (!assigned.ok) throw new Error('assign')
  return assigned.value.assignmentId
}

const comment = (assignmentId: string) =>
  addReviewComment(handle.db, world.reviewer, { assignmentId, body: 'One more note' }, signal)
const signOff = (assignmentId: string) =>
  signOffReview(handle.db, world.reviewer, { assignmentId }, signal)

describe('a finished review', () => {
  it('refuses comments and a second sign-off once the reviewer has signed off', async () => {
    const assignmentId = await assignmentOn('submitted')
    expect(await comment(assignmentId)).toEqual({ ok: true, value: undefined })
    expect(await signOff(assignmentId)).toEqual({ ok: true, value: undefined })
    expect(await comment(assignmentId)).toEqual({ ok: false, error: 'already_signed_off' })
    expect(await signOff(assignmentId)).toEqual({ ok: false, error: 'already_signed_off' })
  })

  it.each([
    'closed',
    'denied',
    'withdrawn',
    'expired',
  ] as const)('refuses comments and sign-off once the application is %s', async (state) => {
    const assignmentId = await assignmentOn(state)
    expect(await comment(assignmentId)).toEqual({ ok: false, error: 'application_closed' })
    expect(await signOff(assignmentId)).toEqual({ ok: false, error: 'application_closed' })
  })

  it('lets exactly one of several simultaneous sign-offs through', async () => {
    const assignmentId = await assignmentOn('submitted')
    const results = await Promise.all(Array.from({ length: 12 }, () => signOff(assignmentId)))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual(
      Array.from({ length: 11 }, () => ({ ok: false, error: 'already_signed_off' })),
    )
  })
})
