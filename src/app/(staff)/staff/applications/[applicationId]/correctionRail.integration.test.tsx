import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
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
const ACTION = 'Correct this permit'
let handle: TestDb
let rows: (typeof applications.$inferSelect)[] = []

async function actorFor(local: string): Promise<Actor> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  if (actor === null) throw new Error(`no ${local}`)
  return actor
}

async function pageAs(local: string, applicationId: string): Promise<string> {
  state.actor = await actorFor(local)
  return renderToStaticMarkup(
    (await ApplicationPage({ params: Promise.resolve({ applicationId }) })) as never,
  )
}

function idIn(states: string[]): string {
  const row = rows.find((r) => states.includes(r.state))
  if (row === undefined) throw new Error(`no application in ${states.join(', ')}`)
  return row.id
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  rows = await handle.db.select().from(applications)
})
afterAll(async () => {
  await handle.drop()
})

describe('the Correct this permit action', () => {
  it('shows on an issued permit for staff who may correct it', async () => {
    expect(await pageAs('staff', idIn(['issued']))).toContain(ACTION)
  })

  it('is hidden from an administrator without permit.issue', async () => {
    expect(await pageAs('admin', idIn(['issued']))).not.toContain(ACTION)
  })

  it('is hidden while the application is still under review', async () => {
    expect(await pageAs('staff', idIn(['under_review', 'submitted']))).not.toContain(ACTION)
  })
})
