import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { rtkRequests } from '@/db/schema'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { resetOnlineRequestLimits } from '@/features/rtk/onlineRequest'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld } from '@/test/parcels'
import { settle } from '@/test/testHarness/actions/outcome'

interface MockState {
  db: unknown
  csrfCookie: string | null
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok' }))
const mail = vi.hoisted((): { transport: unknown } => ({ transport: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/features/mail/transport', () => ({ getMailTransport: () => mail.transport }))
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
        'x-forwarded-for': '198.51.100.7',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(null) }))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))

const { submitRecordsRequestAction: submitAction } = await import('./actions')
const submit = (formData: FormData) => settle(submitAction(formData))

let handle: TestDb
let sent: ReturnType<typeof createMemoryTransport>

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  sent = createMemoryTransport()
  mail.transport = sent
  resetOnlineRequestLimits()
})

function form(fields: Record<string, string>, token: string | null = 'tok') {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  const base = { email: 'jordan@example.test', description: 'Septic plans for 14 Birch Lane' }
  for (const [key, value] of Object.entries({ ...base, ...fields })) f.set(key, value)
  return f
}

describe('submitRecordsRequestAction', () => {
  it('refuses a missing csrf token and stores nothing', async () => {
    expect(await submit(form({}, null))).toMatchObject({ ok: false })
    expect(await handle.db.select().from(rtkRequests)).toHaveLength(0)
  })

  it('records the request without sign-in and shows the receipt page', async () => {
    const result = await submit(form({ requesterName: 'Jordan Reyes' }))
    expect(result).toMatchObject({
      redirectsTo: expect.stringMatching(
        /^\/records\/request\/received\?ref=RK-\d{4}-\d+&due=\d{4}-\d{2}-\d{2}&emailed=1$/,
      ),
    })
    const rows = await handle.db.select().from(rtkRequests)
    expect(rows.at(-1)).toMatchObject({ receivedVia: 'portal', requesterName: 'Jordan Reyes' })
    expect(sent.sent.map((m) => m.to)).toEqual(['jordan@example.test'])
  })

  it('asks for an email address and what is wanted beside each field', async () => {
    expect(await submit(form({ email: '' }))).toMatchObject({
      ok: false,
      fieldErrors: { email: 'Enter your email address.' },
    })
    expect(await submit(form({ description: '' }))).toMatchObject({
      ok: false,
      fieldErrors: { description: 'Enter the records you are asking for.' },
    })
  })

  it('asks a busy sender to wait instead of recording more requests', async () => {
    for (let i = 0; i < 3; i++) expect(await submit(form({}))).toHaveProperty('redirectsTo')
    expect(await submit(form({}))).toEqual({
      ok: false,
      error: 'Too many requests were sent from here. Wait an hour and try again.',
    })
  })
})
