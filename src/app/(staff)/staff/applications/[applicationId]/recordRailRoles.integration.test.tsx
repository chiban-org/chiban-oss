import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
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
let ids = new Map<string, string>()
const actors = new Map<string, Actor>()

async function actorFor(local: string): Promise<Actor> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  if (actor === null) throw new Error(`no ${local}`)
  return actor
}

async function railAs(role: string, number: string): Promise<string> {
  state.actor = actors.get(role)
  const html = renderToStaticMarkup(
    (await ApplicationPage({
      params: Promise.resolve({ applicationId: ids.get(number) ?? '' }),
    })) as never,
  )
  return sectionOf(html, 'Next step') ?? ''
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  for (const role of ['admin', 'staff', 'finance', 'inspector']) {
    actors.set(role, await actorFor(role))
  }
  const rows = await handle.db.select().from(applications)
  ids = new Map(rows.map((r) => [r.number, r.id]))
})
afterAll(async () => {
  await handle.drop()
})

describe('the rail offers only moves this viewer can make', () => {
  it('shows admin the blockers before a decision without a move admin cannot make', async () => {
    const staff = await railAs('staff', 'BP-2026-0001')
    const admin = await railAs('admin', 'BP-2026-0001')
    expect(staff).toContain('Before decided')
    expect(admin).toContain('Before decided')
    expect(admin).toContain('No reviewer is assigned.')
    expect(admin).toContain('href="#reviewers"')
    expect(admin).not.toContain('Move to decided')
  })

  it('offers no move to closed on an issued permit to finance or admin', async () => {
    expect(await railAs('staff', 'BP-2025-0001')).toContain('Yes, move to closed')
    for (const role of ['finance', 'admin']) {
      const rail = await railAs(role, 'BP-2025-0001')
      expect(rail).not.toContain('move to closed')
    }
  })

  it('points a submitted board application at the completeness vote, not a bare move', async () => {
    const staff = await railAs('staff', 'SPR-2026-0001')
    expect(staff).not.toContain('Move to under review')
    expect(staff).toContain('href="#board"')
    expect(staff).toContain('Record the completeness vote')
    const finance = await railAs('finance', 'SPR-2026-0001')
    expect(finance).not.toContain('Move to under review')
    expect(finance).not.toContain('Record the completeness vote')
    expect(finance).toContain('The board votes on whether the application is complete.')
  })

  it('offers the step and the withdrawal only to roles that manage the workflow', async () => {
    for (const role of ['staff', 'admin']) {
      const rail = await railAs(role, 'SPR-2026-0001')
      expect(rail).toContain('Set step')
      expect(rail).toContain('Move to withdrawn')
    }
    for (const role of ['finance', 'inspector']) {
      const rail = await railAs(role, 'SPR-2026-0001')
      expect(rail).not.toContain('Set step')
      expect(rail).not.toContain('withdrawn')
    }
  })
})
