import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { importRuns, parcels } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/staff',
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const page = async (path: string) =>
  ((await import(`@/app/(staff)/staff/${path}/page`)) as { default: (p: unknown) => unknown })
    .default

const signal = new AbortController().signal
const run = { id: '' }
let handle: TestDb

async function actAs(email: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${email}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function html(element: unknown): Promise<string> {
  return renderToStaticMarkup((await element) as never)
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const [first] = await handle.db.select({ id: importRuns.id }).from(importRuns).limit(1)
  run.id = first?.id ?? ''
})
afterAll(async () => {
  await handle.drop()
})

const NO_PERMISSION = 'You do not have permission'
const SEARCH = { searchParams: Promise.resolve({}) }
const CASES: [string, unknown][] = [
  ['gis/imports', SEARCH],
  ['gis/imports/[runId]', { params: Promise.resolve({ runId: '' }) }],
  ['gis/exceptions', { searchParams: Promise.resolve({}) }],
  ['parcels/unresolved', undefined],
  ['overrides/aliases', SEARCH],
  ['overrides/fees', SEARCH],
  ['overrides/clocks', undefined],
  ['settings', SEARCH],
  ['settings/payments', undefined],
  ['settings/[kind]', { params: Promise.resolve({ kind: 'fee_schedule' }), ...SEARCH }],
  [
    'settings/[kind]/[key]',
    { params: Promise.resolve({ kind: 'fee_schedule', key: 'building-fees' }) },
  ],
]

describe('record administration pages', () => {
  it.each(CASES)('a reviewer gets the permission page on %s', async (path, props) => {
    await actAs('reviewer')
    const render = await page(path)
    const given =
      path === 'gis/imports/[runId]' ? { params: Promise.resolve({ runId: run.id }) } : props
    expect(await html(render(given))).toContain(NO_PERMISSION)
  })

  it('staff still reach the settings and overrides pages', async () => {
    await actAs('staff')
    expect(await html((await page('settings'))(SEARCH))).not.toContain(NO_PERMISSION)
    expect(await html((await page('overrides/aliases'))(SEARCH))).not.toContain(NO_PERMISSION)
  })

  it('only configuration editors get the settings editor, others see the permission page first', async () => {
    const props = { params: Promise.resolve({ kind: 'fee_schedule', key: 'building-fees' }) }
    await actAs('staff')
    expect(await html((await page('settings/[kind]/[key]'))(props))).toContain(NO_PERMISSION)
    await actAs('admin')
    expect(
      await html(
        (await page('settings/[kind]/[key]'))({
          params: Promise.resolve({ kind: 'fee_schedule', key: 'building-fees' }),
        }),
      ),
    ).not.toContain(NO_PERMISSION)
  })

  it('parcel ID overrides and lineage events are offered only to those who may record them', async () => {
    const [parcel] = await handle.db.select({ id: parcels.id }).from(parcels).limit(1)
    const props = () => ({ params: Promise.resolve({ parcelId: parcel?.id ?? '' }) })
    await actAs('reviewer')
    const reviewerPage = await html((await page('parcels/[parcelId]'))(props()))
    expect(reviewerPage).not.toContain('Override an ID')
    expect(reviewerPage).not.toContain('Record lineage event')
    expect(
      await html(
        (await page('parcels/lineage/new'))({ searchParams: Promise.resolve({ parent: '' }) }),
      ),
    ).toContain(NO_PERMISSION)
    await actAs('staff')
    const staffPage = await html((await page('parcels/[parcelId]'))(props()))
    expect(staffPage).toContain('Override an ID')
    expect(staffPage).toContain('Record lineage event')
  })
})
