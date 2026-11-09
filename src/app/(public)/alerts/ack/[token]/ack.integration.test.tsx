import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { alertTests } from '@/db/schema'
import { createEmailChannel } from '@/features/health/channels/emailChannel'
import { alertReadiness, sendSyntheticAlert } from '@/features/health/syntheticAlert'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedTown } from '@/test/parcels'

interface MockState {
  db: unknown
  csrf: string | null
}

const state = vi.hoisted((): MockState => ({ db: null, csrf: 'tok' }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrf !== null ? { value: 'tok' } : undefined,
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

const { default: AckPage } = await import('./page')
const { acknowledgeAlertAction } = await import('./actions')

const signal = new AbortController().signal
let handle: TestDb
let token = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedTown(handle.db)
  const mail = createMemoryTransport()
  await sendSyntheticAlert(
    handle.db,
    [createEmailChannel(mail, ['ops@alderpond.example'])],
    signal,
    {
      now: new Date(),
      createdByKind: 'cli',
    },
  )
  token = /\/alerts\/ack\/([A-Za-z0-9_-]{43})/.exec(mail.sent[0]?.text ?? '')?.[1] ?? ''
})
afterAll(async () => {
  await handle.drop()
})

const render = async (t: string) =>
  renderToStaticMarkup(await AckPage({ params: Promise.resolve({ token: t }) }))

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [k, v] of Object.entries(fields)) data.set(k, v)
  return data
}

describe('alert acknowledgement page', () => {
  it('a GET on the ack link does not acknowledge', async () => {
    const html = await render(token)
    expect(html).toContain('Confirm I received this alert')
    await render(token)
    const [row] = await handle.db.select().from(alertTests)
    expect(row?.acknowledgedAt).toBeNull()
  })

  it('shows a plain message for a token that does not exist', async () => {
    const html = await render('y'.repeat(43))
    expect(html).toContain('This link is no longer valid')
    expect(html).not.toContain('Confirm I received this alert')
  })

  it('lays the page out like the other public pages, not as a centred narrow column', async () => {
    expect(await render('y'.repeat(43))).toMatch(/^<main>/)
    expect(await render(token)).toMatch(/^<main>/)
  })

  it('refuses the action without a csrf token and acknowledges nothing', async () => {
    const result = await acknowledgeAlertAction(form({ token, csrf_token: 'wrong' }))
    expect(result.ok).toBe(false)
    const [row] = await handle.db.select().from(alertTests)
    expect(row?.acknowledgedAt).toBeNull()
  })

  it('pressing confirm acknowledges and readiness shows acknowledged', async () => {
    const result = await acknowledgeAlertAction(form({ token, csrf_token: 'tok' }))
    expect(result.ok).toBe(true)
    const readiness = await alertReadiness(handle.db, ['email'], new Date(), signal)
    expect(readiness[0]?.status).toBe('acknowledged')
    expect(await render(token)).toContain('has been recorded')
  })
})
