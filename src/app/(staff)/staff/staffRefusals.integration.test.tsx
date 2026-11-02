import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'

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

const { default: QueuePage } = await import('@/app/(staff)/staff/queue/page')
const { default: ApplicationsPage } = await import('@/app/(staff)/staff/applications/page')
const { default: ReviewsPage } = await import('@/app/(staff)/staff/reviews/page')
const { default: InspectionsPage } = await import('@/app/(staff)/staff/inspections/page')
const { default: DayPage } = await import('@/app/(staff)/staff/inspections/day/page')
const { default: PaymentsPage } = await import('@/app/(staff)/staff/payments/page')
const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const signal = new AbortController().signal
let handle: TestDb
let applicationId = ''

async function actAs(email: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${email}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function html(element: Promise<unknown>): Promise<string> {
  return renderToStaticMarkup((await element) as never)
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const [row] = await handle.db.select().from(applications)
  applicationId = row?.id ?? ''
})
afterAll(async () => {
  await handle.drop()
})

const NO_PERMISSION = 'You do not have permission'
const noSearch = { searchParams: Promise.resolve({}) }

describe('section pages refuse with one permission page', () => {
  it('a board member gets the permission page on the queue and application list', async () => {
    await actAs('board')
    expect(await html(QueuePage(noSearch))).toContain(NO_PERMISSION)
    expect(await html(ApplicationsPage(noSearch))).toContain(NO_PERMISSION)
    expect(await html(ReviewsPage())).toContain(NO_PERMISSION)
  })

  it('a reviewer gets the permission page, not a missing page, on the inspection board and day list', async () => {
    await actAs('reviewer')
    expect(await html(InspectionsPage(noSearch))).toContain(NO_PERMISSION)
    expect(await html(DayPage(noSearch))).toContain(NO_PERMISSION)
  })

  it('an inspector gets the permission page on payments', async () => {
    await actAs('inspector')
    expect(await html(PaymentsPage())).toContain(NO_PERMISSION)
  })

  it('a record by id stays a missing page for someone who may not see it', async () => {
    await actAs('board')
    await expect(
      html(ApplicationPage({ params: Promise.resolve({ applicationId }) })),
    ).rejects.toThrow('NOT_FOUND')
  })
})
