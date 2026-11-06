import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, users } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { queueFacets } from '@/features/queue/queueFacets'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'
import { sectionOf } from '@/test/htmlSections'

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
let handle: TestDb

async function actorFor(local: string): Promise<Actor> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  if (actor === null) throw new Error(`no ${local}`)
  return actor
}

async function keyFactsAs(local: string, applicationId: string): Promise<string> {
  state.actor = await actorFor(local)
  const html = renderToStaticMarkup(
    (await ApplicationPage({ params: Promise.resolve({ applicationId }) })) as never,
  )
  return sectionOf(html, 'Key facts') ?? ''
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
})
afterAll(async () => {
  await handle.drop()
})

describe('the responsible staff member in the demo town', () => {
  it('gives the clerk and the planner applications of their own, counted under Mine', async () => {
    const owned = await handle.db
      .select({ id: applications.id, name: users.displayName })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.responsibleUserId))
    expect(new Set(owned.map((o) => o.name))).toEqual(new Set(['Sam Clerk', 'Pat Planner']))
    for (const local of ['staff', 'planner']) {
      const facets = await queueFacets(handle.db, await actorFor(local), { filters: {} }, signal)
      expect(facets.assigned.get('me')).toBeGreaterThan(0)
    }
  })

  it('names the owner on the record and lets only workflow managers change it', async () => {
    const [first] = await handle.db
      .select({ id: applications.id, name: users.displayName })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.responsibleUserId))
      .limit(1)
    if (first === undefined) throw new Error('no responsible staff seeded')
    const staff = await keyFactsAs('staff', first.id)
    expect(staff).toContain(first.name)
    expect(staff).toContain('Change who is responsible')
    const inspector = await keyFactsAs('inspector', first.id)
    expect(inspector).toContain(first.name)
    expect(inspector).not.toContain('Change who is responsible')
  })
})
