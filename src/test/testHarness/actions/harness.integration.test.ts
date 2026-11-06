import { describe, expect, it, vi } from 'vitest'
import { CAPABILITY_KEYS } from '@/constants/capabilities'
import { ROLES } from '@/constants/roles'
import { hasCapability } from '@/features/authz/capabilities'
import { makeUser } from '@/test/factories'
import {
  actionHarness,
  MISMATCHED_CSRF_TOKEN,
  rolesHolding,
  settle,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const { guardAction } = await import('@/server/actionGuard')
const { calendarPushJob } = await import('@/jobs/calendarPush')
const { enqueue } = await import('@/jobs/defineJob')
const { ensureQueue } = await import('@/jobs/queues')
const { getMailTransport } = await import('@/features/mail/transport')
const { getObjectStore } = await import('@/features/storage/objectStore')
const { redirect, notFound } = await import('next/navigation')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal

describe('actionHarness', () => {
  it('gives each role actor exactly the capabilities the default grants name', async () => {
    const mismatches: string[] = []
    for (const role of ROLES) {
      const actor = await h.actorFor(role)
      for (const capability of CAPABILITY_KEYS) {
        const held = await hasCapability(h.db, actor.userId, capability, signal)
        if (held !== rolesHolding(capability).includes(role))
          mismatches.push(`${role} ${capability}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('makes applicant and contractor actors public and the rest staff', async () => {
    const kinds = await Promise.all(ROLES.map(async (r) => [r, (await h.actorFor(r)).kind]))
    expect(Object.fromEntries(kinds)).toEqual({
      admin: 'staff',
      staff: 'staff',
      inspector: 'staff',
      finance: 'staff',
      records_custodian: 'staff',
      reviewer: 'staff',
      board_member: 'staff',
      applicant: 'public',
      contractor: 'public',
    })
  })

  it('passes the guard with the signed-in actor and the default csrf token', async () => {
    const actor = await h.actorFor('staff')
    h.signIn(actor)
    expect(await guardAction(h.form({}), signal)).toEqual({ ok: true, value: actor })
  })

  it('reports a signed-out caller to the guard as no actor', async () => {
    expect(await guardAction(h.form({}), signal)).toEqual({ ok: true, value: null })
  })

  it('fails the guard on a missing or mismatched token, a missing cookie, or a foreign origin', async () => {
    const refused = { ok: false, error: 'csrf' }
    expect(await guardAction(h.form({}, null), signal)).toEqual(refused)
    expect(await guardAction(h.form({}, MISMATCHED_CSRF_TOKEN), signal)).toEqual(refused)
    h.setHeader('origin', 'https://elsewhere.example')
    expect(await guardAction(h.form({}), signal)).toEqual(refused)
    h.setHeader('origin', null)
    h.setCookie('chiban_csrf', null)
    expect(await guardAction(h.form({}), signal)).toEqual(refused)
  })

  it('names the tables a write touched and nothing for a read', async () => {
    const write = await h.recordWrites(() => makeUser(h.db, { role: 'finance' }))
    expect(write.written).toEqual(['user_roles', 'users'])
    const read = await h.recordWrites(() => h.db.query.users.findMany())
    expect(read.written).toEqual([])
  })

  it('turns redirect and notFound into values', async () => {
    expect(await settle(Promise.resolve().then(() => redirect('/staff/sign-in')))).toEqual({
      redirectsTo: '/staff/sign-in',
    })
    expect(await settle(Promise.resolve().then(() => notFound()))).toEqual({ notFound: true })
  })

  it('captures mail sent through the shared transport', async () => {
    await getMailTransport().send(
      { to: 'a@alderpond.example', subject: 'Hi', text: 't', html: 'h' },
      signal,
    )
    expect(h.mail.sent.map((m) => m.subject)).toEqual(['Hi'])
  })

  it('serves the object store from a bucket made for this file', () => {
    expect(getObjectStore()).toBe(h.store)
  })

  it('records the jobs an action enqueues with their dedup keys', async () => {
    await enqueue(calendarPushJob, { pushId: 'p1', attempts: 0 }, signal)
    await ensureQueue(calendarPushJob.name)
    expect(h.jobs).toEqual([
      {
        name: calendarPushJob.name,
        data: { pushId: 'p1', attempts: 0 },
        singletonKey: calendarPushJob.dedupKey({ pushId: 'p1', attempts: 0 }),
      },
    ])
  })

  it('starts each test with no jobs recorded', () => {
    expect(h.jobs).toEqual([])
  })
})
