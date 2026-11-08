import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import type { Actor } from '@/features/auth/actor'
import { getPublished } from '@/features/config/store'
import { loadReportFields } from '@/features/reports/reportFields'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

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
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
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
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const { default: ReportFieldsPage } = await import('./[key]/page')
const { publishAction } = await import('@/app/(staff)/staff/settings/actions')

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

const params = (key: string) => ({ params: Promise.resolve({ key }) })

function form(body: unknown): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  f.set('kind', 'application_type')
  f.set('key', 'BP')
  f.set('body', JSON.stringify(body))
  f.set('intent', 'publish')
  return f
}

describe('reporting fields settings', () => {
  it('offers the numeric questions on the type form and none of the others', async () => {
    state.actor = world.admin
    const html = renderToStaticMarkup(await ReportFieldsPage(params('BP')))
    expect(html).toContain('Report columns for Building permit')
    expect(html).toContain('Finished sq ft (number)')
    expect(html).not.toContain('Classification (')
    expect(html).toContain('Version history')
  })

  it('tells staff without configuration rights they cannot change it', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await ReportFieldsPage(params('BP')))
    expect(html).toContain('You do not have permission to change report columns.')
  })

  it('publishing the choice puts it into a new version that the reports read', async () => {
    state.actor = world.admin
    const result = await publishAction(form(appTypeBody({ reportFields: ['finished_sq_ft'] })))
    expect(result.ok).toBe(true)
    const published = await getPublished(handle.db, 'application_type', 'BP', signal)
    const body = ApplicationTypeBodySchema.parse(published?.body)
    expect(body.reportFields).toEqual(['finished_sq_ft'])
    expect((await loadReportFields(handle.db, signal)).byType.get('BP')).toEqual(['finished_sq_ft'])
  })

  it('refuses the same change from staff who lack configuration rights', async () => {
    state.actor = world.staff
    const result = await publishAction(form(appTypeBody({ reportFields: [] })))
    expect(result.ok).toBe(false)
  })
})
