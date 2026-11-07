import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { workArea } from '@/test/htmlSections'

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
  return workArea(html)
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
    expect(staff).toContain('Before the decision')
    expect(admin).toContain('Before the decision')
    expect(admin).toContain('No reviewer is assigned.')
    expect(admin).toContain('href="#reviewers"')
    expect(admin).not.toContain('>Record the decision<')
  })

  it('offers no move to closed on an issued permit whose closing is blocked, to any role', async () => {
    expect(await railAs('staff', 'BP-2025-0001')).toContain('href="#inspections"')
    for (const role of ['staff', 'finance', 'admin']) {
      const rail = await railAs(role, 'BP-2025-0001')
      expect(rail).not.toMatch(/move to closed|>Close the permit</i)
    }
  })

  it('points a submitted board application at its meeting and vote, not a bare move', async () => {
    const staff = await railAs('staff', 'SPR-2026-0001')
    expect(staff).not.toContain('Move to under review')
    expect(staff).not.toContain('Start the review')
    expect(staff).toContain('href="#board"')
    expect(staff).toContain('Move the acceptance meeting')
    const finance = await railAs('finance', 'SPR-2026-0001')
    expect(finance).not.toContain('Start the review')
    expect(finance).toMatch(/Vote on completeness at the meeting on [A-Z][a-z]+ \d+, 2026/)
    expect(finance).toContain('is after this deadline')
    expect(finance).not.toContain('name="outcome"')
    expect(finance).not.toContain('Set the meeting')
    expect(finance).not.toContain('Move the meeting')
  })

  it('offers the step and the withdrawal only to roles that manage the workflow', async () => {
    for (const role of ['staff', 'admin']) {
      const rail = await railAs(role, 'SPR-2026-0001')
      expect(rail).toContain('Set step')
      expect(rail).toContain('Withdraw the application')
    }
    for (const role of ['finance', 'inspector']) {
      const rail = await railAs(role, 'SPR-2026-0001')
      expect(rail).not.toContain('Set step')
      expect(rail).not.toContain('Withdraw the application')
    }
  })
})
