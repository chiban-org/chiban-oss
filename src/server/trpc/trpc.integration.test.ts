import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Role } from '@/constants/roles'
import { loadActor } from '@/features/auth/actor'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { makeTestContext } from '@/server/testCaller'
import {
  authedProcedure,
  capabilityProcedure,
  createCallerFactory,
  publicProcedure,
  router,
  staffProcedure,
} from '@/server/trpc/trpc'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

const testRouter = router({
  open: publicProcedure.query(() => 'open'),
  authed: authedProcedure.query(({ ctx }) => ctx.actor.userId),
  staffOnly: staffProcedure.query(() => 'staff'),
  issue: capabilityProcedure('permit.issue').mutation(() => 'issued'),
})
const callerFor = createCallerFactory(testRouter)

let handle: TestDb
const signal = new AbortController().signal

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDefaultGrants(handle.db, signal)
})
afterAll(async () => {
  await handle.drop()
})

async function asRole(role: Role) {
  const userId = await makeUser(handle.db, { role })
  const actor = await loadActor(handle.db, userId, signal)
  return callerFor(makeTestContext(handle.db, actor))
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (e) {
    if (e instanceof TRPCError) return e.code
    throw e
  }
  return 'OK'
}

describe('procedures', () => {
  it('lets anyone call a public procedure', async () => {
    expect(await callerFor(makeTestContext(handle.db, null)).open()).toBe('open')
  })

  it('rejects an anonymous caller from an authed procedure with UNAUTHORIZED', async () => {
    const caller = callerFor(makeTestContext(handle.db, null))
    expect(await codeOf(caller.authed())).toBe('UNAUTHORIZED')
    expect(await codeOf(caller.staffOnly())).toBe('UNAUTHORIZED')
    expect(await codeOf(caller.issue())).toBe('UNAUTHORIZED')
  })

  it('rejects a public actor from a staff procedure with FORBIDDEN', async () => {
    const caller = await asRole('applicant')
    expect(await caller.authed()).toBeTypeOf('string')
    expect(await codeOf(caller.staffOnly())).toBe('FORBIDDEN')
  })

  it('rejects a reviewer from permit.issue but accepts staff', async () => {
    expect(await codeOf((await asRole('reviewer')).issue())).toBe('FORBIDDEN')
    expect(await codeOf((await asRole('staff')).issue())).toBe('OK')
  })

  it('rejects an applicant from a capability procedure', async () => {
    expect(await codeOf((await asRole('applicant')).issue())).toBe('FORBIDDEN')
  })
})
