import { isNotNull } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { complaints } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { CHANNEL_LABELS } from '@/features/enforcement/labels'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { visibleText } from '@/test/leaks'

interface MockState {
  db: unknown
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

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

const { default: CasePage } = await import('@/app/(staff)/staff/enforcement/[caseId]/page')

const signal = new AbortController().signal
let handle: TestDb
let complaint: typeof complaints.$inferSelect

async function caseTextAs(local: string): Promise<string> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
  const page = await CasePage({ params: Promise.resolve({ caseId: complaint.caseId ?? '' }) })
  return visibleText(renderToStaticMarkup(page as never))
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const [named] = await handle.db
    .select()
    .from(complaints)
    .where(isNotNull(complaints.complainantName))
    .limit(1)
  if (named === undefined) throw new Error('the demo has no named complaint')
  complaint = named
})
afterAll(async () => {
  await handle.drop()
})

function identity(): string[] {
  return [
    complaint.complainantName ?? '',
    complaint.complainantEmail ?? '',
    complaint.complainantPhone ?? '',
    complaint.descriptionOriginal,
  ].filter((value) => value !== '')
}

describe('complainant identity on an enforcement case', () => {
  it('shows the complainant and the original text to a viewer who manages enforcement', async () => {
    const text = await caseTextAs('inspector')
    for (const value of identity()) expect(text).toContain(value)
  })

  it('shows only that a complaint came in, with its date and channel, to finance and admin', async () => {
    for (const who of ['finance', 'admin']) {
      const text = await caseTextAs(who)
      expect(text).toContain(complaint.number)
      expect(text).toContain(CHANNEL_LABELS[complaint.channel])
      for (const value of identity()) expect(text).not.toContain(value)
      expect(text).not.toContain('What was reported')
    }
  })
})
