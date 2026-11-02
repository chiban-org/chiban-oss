import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { inspections } from '@/db/schema'
import { recordAppeal } from '@/features/appeals/appeals'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  checklistIdFor,
  civil,
  type InspectionWorld,
  insertInspection,
  newIssuedPermit,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'

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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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
vi.mock('@/features/town/today', async (original) => ({
  ...(await original<typeof import('@/features/town/today')>()),
  townToday: () => Promise.resolve('2027-07-01'),
}))

const actions = await import('./actions')
const { default: Page } = await import('./page')

let handle: TestDb
let w: InspectionWorld

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [key, value] of Object.entries(fields)) f.set(key, value)
  return f
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function render(applicationId: string, reinspect?: string): Promise<string> {
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ applicationId }),
      searchParams: Promise.resolve(reinspect === undefined ? {} : { reinspect }),
    }),
  )
}

describe('portal inspection requests', () => {
  it('a party requests an inspection and cancels it', async () => {
    state.actor = w.world.applicant
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const requested = await actions.portalRequestInspectionAction(
      form({
        applicationId: permit.applicationId,
        checklistVersionId: await checklistIdFor(handle.db, permit.applicationId, 'rough'),
        contactName: 'Alex',
        contactPhone: '603-555-0123',
        preferredDate: '2027-07-07',
      }),
    )
    expect(requested).toMatchObject({ ok: true })
    const [row] = await handle.db
      .select()
      .from(inspections)
      .where(eq(inspections.applicationId, permit.applicationId))
    expect(row).toMatchObject({
      channel: 'portal',
      status: 'requested',
      preferredDate: '2027-07-07',
    })
    const cancelled = await actions.portalCancelInspectionAction(
      form({ inspectionId: row?.id ?? '', expectedRowVersion: String(row?.rowVersion) }),
    )
    expect(cancelled).toMatchObject({ ok: true })
  })

  it('portal request action by a non-party is not_found', async () => {
    state.actor = w.stranger
    const r = await actions.portalRequestInspectionAction(
      form({
        applicationId: w.trade.applicationId,
        checklistVersionId: await checklistIdFor(handle.db, w.trade.applicationId, 'rough'),
        contactName: 'Mallory',
      }),
    )
    expect(r).toEqual({ ok: false, error: 'That record was not found.' })
  })

  it('a signed-out visitor cannot request', async () => {
    state.actor = null
    const r = await actions.portalRequestInspectionAction(
      form({ applicationId: w.trade.applicationId, checklistVersionId: 'x', contactName: 'n' }),
    )
    expect(r).toEqual({ ok: false, error: 'Sign in to continue.' })
  })

  it('a cancel by another applicant is not_found', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough', {
      channel: 'portal',
      requestedByUserId: w.world.applicant.userId,
    })
    state.actor = w.stranger
    const r = await actions.portalCancelInspectionAction(
      form({ inspectionId: id, expectedRowVersion: '1' }),
    )
    expect(r).toEqual({ ok: false, error: 'That record was not found.' })
  })

  it('the page lists the types, the open days, and the town phone hours', async () => {
    state.actor = w.world.applicant
    const html = await render(w.trade.applicationId)
    expect(html).toContain('Request an inspection')
    expect(html).toContain('Weekdays, 8:00 AM to 12:00 PM')
    expect(html).toContain('Electrical rough inspection')
    expect(html).toContain('Electrical final inspection')
  })

  it('page for a suspended permit offers no request form', async () => {
    state.actor = w.world.applicant
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await recordAppeal(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        filedOn: civil('2027-06-30'),
        appellantName: 'Neighbor',
      },
      new AbortController().signal,
    )
    const html = await render(permit.applicationId)
    expect(html).toContain('Inspections are paused while this permit is under appeal.')
    expect(html).not.toContain('Request an inspection')
  })

  it('page for another applicant is not found', async () => {
    state.actor = w.stranger
    await expect(render(w.trade.applicationId)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('page for a signed-out visitor sends them to sign in', async () => {
    state.actor = null
    await expect(render(w.trade.applicationId)).rejects.toThrow('NEXT_REDIRECT')
  })

  it('a failed inspection offers a reinspection request that links back to it', async () => {
    state.actor = w.world.applicant
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const failed = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
      resultNotes: 'Secure the box',
    })
    const list = await render(permit.applicationId)
    expect(list).toContain(`reinspect=${failed}`)
    const form = await render(permit.applicationId, failed)
    expect(form).toContain('name="reinspectionOf"')
    expect(form).toContain(`value="${failed}"`)
    expect(form).not.toContain('Electrical final inspection')
  })

  it('a reinspect id from another permit is ignored', async () => {
    state.actor = w.world.applicant
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const other = await newIssuedPermit(handle.db, w, 'EL')
    const failed = await insertInspection(handle.db, other.applicationId, 'rough', {
      status: 'failed',
    })
    const form = await render(permit.applicationId, failed)
    expect(form).not.toContain('name="reinspectionOf"')
  })
})
