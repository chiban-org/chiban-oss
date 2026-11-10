import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { enforcementCases, users } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'
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

const { default: QueuePage } = await import('@/app/(staff)/staff/enforcement/page')
const { default: CasePage } = await import('@/app/(staff)/staff/enforcement/[caseId]/page')

const signal = new AbortController().signal
let handle: TestDb
let owned = { id: '', name: '' }

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

const html = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as never)

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const [row] = await handle.db
    .select({ id: enforcementCases.id, name: users.displayName })
    .from(enforcementCases)
    .innerJoin(users, eq(users.id, enforcementCases.assignedTo))
    .limit(1)
  owned = row ?? owned
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('the assignee of an enforcement case', () => {
  it('is a column on the case list', async () => {
    await actAs('staff')
    const page = await html(QueuePage({ searchParams: Promise.resolve({}) }))
    expect(page).toContain('>Assigned to<')
    expect(page).toContain(`>${owned.name}<`)
  })

  it('is named on the case page with a reassign control for enforcement.manage only', async () => {
    await actAs('staff')
    const staff = await html(CasePage({ params: Promise.resolve({ caseId: owned.id }) }))
    const facts = sectionOf(staff, 'Assignment') ?? ''
    expect(facts).toContain('Assigned to')
    expect(facts).toContain(owned.name)
    expect(facts).toContain('Reassign the case')
    await actAs('admin')
    const admin = await html(CasePage({ params: Promise.resolve({ caseId: owned.id }) }))
    expect(admin).toContain(owned.name)
    expect(admin).not.toContain('Reassign the case')
  })
})
