import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { findUuids } from '@/test/leaks'

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
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const signal = new AbortController().signal
const NO_PERMISSION = 'You do not have permission'
const FULL_RECORD_ONLY = [
  'Fees and payments',
  'Gates',
  'Parties',
  'Clocks',
  'Conditions',
  'Records',
  'Next step',
]
let handle: TestDb
let ids = new Map<string, string>()

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function page(number: string): Promise<string> {
  const element = await ApplicationPage({
    params: Promise.resolve({ applicationId: ids.get(number) ?? number }),
  })
  return renderToStaticMarkup(element as never)
}

function expectNoFullRecord(html: string) {
  for (const label of FULL_RECORD_ONLY) expect(html).not.toContain(`aria-label="${label}"`)
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const rows = await handle.db.select().from(applications)
  ids = new Map(rows.map((r) => [r.number, r.id]))
})

afterAll(async () => {
  await handle.drop()
})

describe('reviewer access to the record page', () => {
  it('an assigned reviewer gets a read-only record with a link to their review', async () => {
    await actAs('reviewer')
    const html = await page('EL-2026-0003')
    expect(html).toContain('EL-2026-0003')
    expect(html).toContain('href="/staff/reviews/')
    expect(html).toContain('Your review')
    expect(html).not.toContain(NO_PERMISSION)
    expectNoFullRecord(html)
    const rail = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
    expect(rail).toContain('href="/staff/reviews/')
    expect(html).toMatch(/href="\/staff\/parcels\/[0-9a-f-]{36}"/)
  })

  it('a reviewer who is not assigned gets the permission message, not a missing page', async () => {
    await actAs('reviewer')
    const html = await page('VAR-2026-0004')
    expect(html).toContain(NO_PERMISSION)
    expect(html).not.toContain('VAR-2026-0004')
    expect(html).not.toContain('may have moved')
  })
})

describe('board member access to the record page', () => {
  it('the demo-seeded ZBA seat shows Bea the hearing on a published agenda', async () => {
    await actAs('board')
    const html = await page('VAR-2026-0003')
    expect(html).toContain('VAR-2026-0003')
    expect(html).toMatch(/Public hearing, [A-Z][a-z]+ \d{1,2}, \d{4}\. Scheduled\./)
    expect(html).toContain('The meeting packet is not ready yet.')
    expect(html).not.toContain('href="/board/meetings/')
    expect(html).not.toContain(NO_PERMISSION)
    expectNoFullRecord(html)
  })

  it('a seated member still cannot open an application with no hearing on a published agenda', async () => {
    await actAs('board')
    const html = await page('VAR-2026-0004')
    expect(html).toContain(NO_PERMISSION)
    expect(html).not.toContain('VAR-2026-0004')
  })

  it('a member asking for an application that does not exist learns nothing more', async () => {
    await actAs('board')
    const html = await page('00000000-0000-4000-8000-000000000000')
    expect(html).toContain(NO_PERMISSION)
    expect(findUuids(html)).toEqual([])
  })
})
