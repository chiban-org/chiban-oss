import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import { userRoles, users } from '@/db/schema'
import { hasCapability, requireCapability } from '@/features/authz/capabilities'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
const signal = new AbortController().signal
const ids = new Map<Role, string>()

async function addUser(role: Role, isActive = true): Promise<string> {
  const rows = await handle.db
    .insert(users)
    .values({
      email: `${role}-${isActive ? 'on' : 'off'}@alderpond.example`,
      displayName: role,
      kind: role === 'applicant' || role === 'contractor' ? 'public' : 'staff',
      isActive,
    })
    .returning({ id: users.id })
  const id = rows[0]?.id ?? ''
  await handle.db.insert(userRoles).values({ userId: id, role })
  return id
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDefaultGrants(handle.db, signal)
  for (const role of [
    'admin',
    'staff',
    'inspector',
    'finance',
    'records_custodian',
    'reviewer',
    'applicant',
  ] as const) {
    ids.set(role, await addUser(role))
  }
})
afterAll(async () => {
  await handle.drop()
})

async function check(role: Role, cap: Capability): Promise<boolean> {
  return await hasCapability(handle.db, ids.get(role) ?? '', cap, signal)
}

describe('default grants from the spec table', () => {
  it('staff can issue permits and reviewers cannot', async () => {
    expect(await check('staff', 'permit.issue')).toBe(true)
    expect(await check('reviewer', 'permit.issue')).toBe(false)
  })

  it('finance can refund and staff cannot', async () => {
    expect(await check('finance', 'payment.refund_void_correct')).toBe(true)
    expect(await check('staff', 'payment.refund_void_correct')).toBe(false)
  })

  it('records custodian approves disposition and admin cannot', async () => {
    expect(await check('records_custodian', 'disposition.approve')).toBe(true)
    expect(await check('admin', 'disposition.approve')).toBe(false)
  })

  it('admin edits config and records statutory exceptions', async () => {
    expect(await check('admin', 'config.edit')).toBe(true)
    expect(await check('admin', 'gate.record_statutory_exception')).toBe(true)
  })

  it('applicants hold no staff capability', async () => {
    expect(await check('applicant', 'permit.issue')).toBe(false)
    expect(await check('applicant', 'config.edit')).toBe(false)
  })

  it('seeding twice changes nothing', async () => {
    await seedDefaultGrants(handle.db, signal)
    expect(await check('staff', 'permit.issue')).toBe(true)
  })
})

describe('deactivated users', () => {
  it('have no capabilities', async () => {
    const id = await addUser('staff', false)
    expect(await hasCapability(handle.db, id, 'permit.issue', signal)).toBe(false)
    await handle.db.update(users).set({ isActive: true }).where(eq(users.id, id))
    expect(await hasCapability(handle.db, id, 'permit.issue', signal)).toBe(true)
  })
})

describe('requireCapability', () => {
  it('returns forbidden for a reviewer', async () => {
    const result = await requireCapability(
      handle.db,
      ids.get('reviewer') ?? '',
      'permit.issue',
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('returns ok for staff', async () => {
    const result = await requireCapability(
      handle.db,
      ids.get('staff') ?? '',
      'permit.issue',
      signal,
    )
    expect(result.ok).toBe(true)
  })
})
