import { and, eq } from 'drizzle-orm'
import type { PoolClient } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userRoles } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { sendPasswordReset } from '@/features/users/credentials'
import { completeStaffLink } from '@/features/users/links'
import { setStaffRoles } from '@/features/users/manage'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { lastToken, staffWith } from '@/test/staffUsers'

const signal = new AbortController().signal
const LOCK = `select pg_advisory_lock(hashtext('chiban.staff_accounts'))`
const UNLOCK = `select pg_advisory_unlock(hashtext('chiban.staff_accounts'))`
let handle: TestDb
let admin: Actor
let mail: MemoryMailTransport
let holder: PoolClient

beforeEach(async () => {
  handle = await makeTestDb()
  await seedDefaultGrants(handle.db, signal)
  admin = await staffWith(handle.db, ['admin'])
  mail = createMemoryTransport()
  holder = await handle.pool.connect()
})
afterEach(async () => {
  holder.release()
  await handle.drop()
})

const ctxOf = (actor: Actor) => ({ db: handle.db, actor, signal, mail })
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

describe('serialised staff account changes', () => {
  it('rechecks permission once the account lock is held', async () => {
    const demoted = await staffWith(handle.db, ['admin'])
    await holder.query(LOCK)
    const queued = setStaffRoles(ctxOf(demoted), demoted.userId, ['admin', 'finance'])
    await settle()
    await handle.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, demoted.userId), eq(userRoles.role, 'admin')))
    await handle.db.insert(userRoles).values({ userId: demoted.userId, role: 'staff' })
    await holder.query(UNLOCK)
    expect(await queued).toEqual({ ok: false, error: 'forbidden' })
    const roles = await handle.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, demoted.userId))
    expect(roles.map((r) => r.role)).toEqual(['staff'])
  })

  it('takes the account lock before completing a link', async () => {
    const target = await makeUser(handle.db, { role: 'staff' })
    await sendPasswordReset(ctxOf(admin), target)
    await holder.query(LOCK)
    let finished = false
    const completing = completeStaffLink(
      handle.db,
      { token: lastToken(mail), password: 'correct horse battery' },
      signal,
    ).then((r) => {
      finished = true
      return r
    })
    await settle()
    expect(finished).toBe(false)
    await holder.query(UNLOCK)
    expect((await completing).ok).toBe(true)
  })
})
