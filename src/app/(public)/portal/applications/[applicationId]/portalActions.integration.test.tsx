import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes } from '@/test/documentFixtures'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
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
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const actions = await import('./actions')
const { default: Page } = await import('./page')
const { GET: receiptGET } = await import('./receipts/[receiptId]/route')
const { startApplicationAction } = await import('@/app/(public)/portal/apply/actions')

let handle: TestDb
let world: PermitWorld
let tradeApplicationId = ''

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) f.append(key, v)
    else f.set(key, value)
  }
  return f
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  await setupPayments(handle.db, world.admin, 'simulated', 'sim_town')
  tradeApplicationId = (await submittedTrade(handle.db, world)).applicationId
})
afterAll(async () => {
  await handle.drop()
})

describe('portal application actions', () => {
  it('a signed-out visitor cannot act', async () => {
    state.actor = null
    const result = await actions.saveDraftAction(form({ applicationId: tradeApplicationId }))
    expect(result).toMatchObject({ ok: false })
  })

  it('a request without the csrf token is refused', async () => {
    state.actor = world.applicant
    const data = new FormData()
    data.set('applicationId', tradeApplicationId)
    expect(await actions.saveDraftAction(data)).toMatchObject({ ok: false })
  })

  it('startApplicationAction creates a draft and redirects to its page', async () => {
    state.actor = await staffActor(handle.db, 'applicant')
    const parcelId = world.parcelId
    await expect(startApplicationAction(form({ parcelId, typeKey: 'BP' }))).rejects.toThrow(
      /NEXT_REDIRECT:\/portal\/applications\//,
    )
  })

  it('saveDraftAction saves partial values and reports field errors for bad ones', async () => {
    state.actor = world.applicant
    const draft = await makeApplication(handle.db, world)
    const saved = await actions.saveDraftAction(
      form({ applicationId: draft.applicationId, finished_sq_ft: '1200' }),
    )
    expect(saved).toEqual({ ok: true, message: 'Draft saved.' })
    const bad = await actions.saveDraftAction(
      form({ applicationId: draft.applicationId, classification: 'castle' }),
    )
    expect(bad).toMatchObject({
      ok: false,
      fieldErrors: { classification: 'Choose one of the listed options.' },
    })
  })

  it('submitApplicationAction needs the attestation box and then submits', async () => {
    state.actor = world.applicant
    const draft = await makeApplication(handle.db, world)
    const { attestationHash } = await import('@/features/applications/submitApplication')
    const hash = attestationHash('I attest the information is true.')
    const base = {
      applicationId: draft.applicationId,
      classification: 'residential',
      attestationSha256: hash,
    }
    const unchecked = await actions.submitApplicationAction(form({ ...base, attest: 'false' }))
    expect(unchecked).toMatchObject({ ok: false })
    const done = await actions.submitApplicationAction(form({ ...base, attest: 'true' }))
    expect(done).toEqual({ ok: true, message: 'Application submitted.' })
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, draft.applicationId))
    expect(row?.state).toBe('submitted')
  })

  it('upload intent then finalize attaches the document, and a stranger is refused', async () => {
    state.actor = world.applicant
    const bytes = pdfBytes('portal upload')
    const intent = await actions.createUploadIntentAction(
      form({
        targetKind: 'application',
        targetId: tradeApplicationId,
        title: 'Site plan',
        filename: 'site.pdf',
        contentType: 'application/pdf',
        sizeBytes: String(bytes.length),
      }),
    )
    if (!intent.ok) throw new Error(intent.error)
    const put = await fetch(intent.url, {
      method: 'PUT',
      headers: intent.headers,
      body: new Blob([bytes]),
    })
    expect(put.ok).toBe(true)
    expect(await actions.finalizeUploadAction(form({ intentId: intent.intentId }))).toEqual({
      ok: true,
    })
    expect((await handle.db.select().from(documents)).map((d) => d.title)).toContain('Site plan')
    state.actor = await staffActor(handle.db, 'applicant')
    const refused = await actions.createUploadIntentAction(
      form({
        targetKind: 'application',
        targetId: tradeApplicationId,
        title: 'x',
        filename: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: '10',
      }),
    )
    expect(refused).toEqual({ ok: false, error: 'You cannot add files here.' })
  })

  it('the page shows a pay button, and startPaymentAction returns the simulated checkout url', async () => {
    state.actor = world.applicant
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ applicationId: tradeApplicationId }) }),
    )
    expect(html).toContain('Pay $46.35')
    expect(html).toContain('includes a $1.35 card convenience fee')
    const started = await actions.startPaymentAction(form({ applicationId: tradeApplicationId }))
    expect(started).toMatchObject({ ok: true })
    expect(started.ok && started.redirectUrl).toMatch(/^\/dev\/checkout\//)
  })

  it('another applicant gets a 404 page and cannot start a payment', async () => {
    state.actor = await staffActor(handle.db, 'applicant')
    await expect(
      Page({ params: Promise.resolve({ applicationId: tradeApplicationId }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    const started = await actions.startPaymentAction(form({ applicationId: tradeApplicationId }))
    expect(started).toEqual({ ok: false, error: 'You cannot pay for this application.' })
  })
})

describe('portal receipt route', () => {
  it('receipt route for another applicant is 404 and the payer gets the pdf', async () => {
    state.actor = world.applicant
    const started = await actions.startPaymentAction(form({ applicationId: tradeApplicationId }))
    expect(started.ok).toBe(true)
    const { loadDevCheckout, resolveDevCheckout } = await import(
      '@/features/payments/simulatedCheckout'
    )
    const objectId = started.ok ? (started.redirectUrl.split('/').pop() ?? '') : ''
    const view = await loadDevCheckout(
      handle.db,
      objectId,
      { enabled: true },
      new AbortController().signal,
    )
    expect(view).not.toBeNull()
    await resolveDevCheckout(handle.db, objectId, 'approve', new AbortController().signal, {
      enabled: true,
    })
    const paidPage = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ applicationId: tradeApplicationId }) }),
    )
    const receiptId = /receipts\/([0-9a-f-]{36})/.exec(paidPage)?.[1] ?? ''
    expect(receiptId).not.toBe('')
    const call = (actor: Actor | null) => {
      state.actor = actor
      return receiptGET(new Request('https://alderpond.example/r'), {
        params: Promise.resolve({ applicationId: tradeApplicationId, receiptId }),
      })
    }
    const own = await call(world.applicant)
    expect(own.status).toBe(200)
    expect(own.headers.get('content-type')).toContain('application/pdf')
    expect((await call(await staffActor(handle.db, 'applicant'))).status).toBe(404)
    expect((await call(null)).status).toBe(404)
  })
})
