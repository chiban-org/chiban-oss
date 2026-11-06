import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const actions = {
  ...(await import('@/app/(staff)/staff/counter/actions')),
  ...(await import('@/app/(staff)/staff/counter/readerActions')),
}

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  await setupPayments(handle.db, world.admin, 'simulated', 'sim_town')
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  state.actor = world.staff
})

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const issueFields = () => ({
  parcelId: world.parcelId,
  typeKey: 'EL',
  contractorName: 'Pat Contractor',
  licenseNumber: 'EL-20418',
  licenseType: 'Electrician',
  licenseResult: 'active',
  method: 'cash',
  tendered: '50',
  'value.description': 'Panel upgrade',
})

const CSRF_COPY = 'Your session expired. Reload the page and try again.'

describe('counter server actions', () => {
  it('quick issue server action without csrf token is refused', async () => {
    expect(await actions.quickIssueAction(form(issueFields(), null))).toEqual({
      ok: false,
      error: CSRF_COPY,
    })
    expect(await actions.quickIssueAction(form(issueFields(), 'wrong'))).toEqual({
      ok: false,
      error: CSRF_COPY,
    })
  })

  it('every reader action refuses a missing csrf token', async () => {
    const fields = { attemptId: 'x', outcome: 'captured', applicationId: 'y' }
    for (const action of [
      actions.readerAction,
      actions.checkAction,
      actions.reconnectAction,
      actions.completeAction,
    ]) {
      expect(await action(form(fields, null))).toEqual({ ok: false, error: CSRF_COPY })
    }
  })

  it('signed out is refused', async () => {
    state.actor = null
    const r = await actions.quickIssueAction(form(issueFields()))
    expect(r).toEqual({ ok: false, error: 'Sign in to continue.' })
  })

  it('a reviewer is told they lack permission', async () => {
    state.actor = world.reviewer
    const r = await actions.quickIssueAction(form(issueFields()))
    expect(r).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('invalid input is reported', async () => {
    const r = await actions.quickIssueAction(form({ ...issueFields(), parcelId: 'nope' }))
    expect(r).toEqual({
      ok: false,
      error: 'Choose a parcel.',
      fieldErrors: { parcelId: 'Choose a parcel.' },
    })
  })

  it('a not-active license is explained', async () => {
    const r = await actions.quickIssueAction(form({ ...issueFields(), licenseResult: 'expired' }))
    expect(r.ok === false && r.error).toContain('The license is not active')
  })

  it('a cash issue returns the permit, placard, and receipt links', async () => {
    const r = await actions.quickIssueAction(form(issueFields()))
    expect(r.ok && r.state).toBe('issued')
    expect(r.ok && r.links?.permit).toMatch(/^\/staff\/applications\/.+\/permit\.pdf$/)
    expect(r.ok && r.links?.placard).toMatch(/\/placard\.pdf$/)
    expect(r.ok && r.links?.receipt).toMatch(/^\/staff\/receipts\//)
  })

  it('a card issue waits on the reader, then approval completes it', async () => {
    const started = await actions.quickIssueAction(form({ ...issueFields(), method: 'card' }))
    if (!started.ok || started.attemptId === null) throw new Error('card start failed')
    expect(started.state).toBe('submitted')
    const read = await actions.readerAction(
      form({ attemptId: started.attemptId, outcome: 'captured' }),
    )
    expect(read).toMatchObject({ ok: true, state: 'captured' })
    const done = await actions.completeAction(form({ applicationId: started.applicationId }))
    expect(done.ok && done.state).toBe('issued')
  })

  it('a card issue whose reader loses connection stays unissued until checked', async () => {
    const started = await actions.quickIssueAction(form({ ...issueFields(), method: 'card' }))
    if (!started.ok || started.attemptId === null) throw new Error('card start failed')
    const lost = await actions.readerAction(
      form({ attemptId: started.attemptId, outcome: 'unknown' }),
    )
    expect(lost).toMatchObject({ ok: true, outcomeUnknown: true })
    const early = await actions.completeAction(form({ applicationId: started.applicationId }))
    expect(early.ok).toBe(false)
    await actions.reconnectAction(form({ attemptId: started.attemptId, outcome: 'captured' }))
    const checked = await actions.checkAction(form({ attemptId: started.attemptId }))
    expect(checked).toMatchObject({ ok: true, state: 'captured', outcomeUnknown: false })
    const done = await actions.completeAction(form({ applicationId: started.applicationId }))
    expect(done.ok && done.state).toBe('issued')
  })
})
