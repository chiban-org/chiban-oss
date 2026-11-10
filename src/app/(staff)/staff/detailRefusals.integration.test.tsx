import { isNotNull } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { abutterLists, inspections, reviewAssignments } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'
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
  usePathname: () => '/staff',
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ReviewPage } = await import('@/app/(staff)/staff/reviews/[assignmentId]/page')
const { default: InspectionPage } = await import(
  '@/app/(staff)/staff/inspections/[inspectionId]/page'
)
const { default: AbutterListPage } = await import('@/app/(staff)/staff/abutters/[listId]/page')

const signal = new AbortController().signal
const MISSING = '00000000-0000-4000-8000-000000000000'
const NO_PERMISSION = 'You do not have permission'
let handle: TestDb
let assignmentId = ''
let listId = ''
let inspection: typeof inspections.$inferSelect

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function text(element: Promise<unknown>): Promise<string> {
  return visibleText(renderToStaticMarkup((await element) as never))
}

const review = (id: string) => ReviewPage({ params: Promise.resolve({ assignmentId: id }) })
const inspectionPage = (id: string) =>
  InspectionPage({ params: Promise.resolve({ inspectionId: id }) })
const abutterList = (id: string) => AbutterListPage({ params: Promise.resolve({ listId: id }) })

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const [assignment] = await handle.db.select().from(reviewAssignments).limit(1)
  const [list] = await handle.db.select().from(abutterLists).limit(1)
  const [withPhone] = await handle.db
    .select()
    .from(inspections)
    .where(isNotNull(inspections.contactPhone))
    .limit(1)
  if (assignment === undefined || list === undefined || withPhone === undefined) {
    throw new Error('the demo is missing a review, an abutter list or an inspection contact')
  }
  assignmentId = assignment.id
  listId = list.id
  inspection = withPhone
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('detail pages refuse a record that exists and 404 one that does not', () => {
  it('a review that is not yours gives the permission page; a missing one is not found', async () => {
    for (const who of ['staff', 'admin', 'inspector']) {
      await actAs(who)
      expect(await text(review(assignmentId))).toContain(NO_PERMISSION)
      await expect(review(MISSING)).rejects.toThrow('NOT_FOUND')
    }
  })

  it('an inspection outside your records gives the permission page; a missing one is not found', async () => {
    for (const who of ['reviewer', 'board']) {
      await actAs(who)
      const body = await text(inspectionPage(inspection.id))
      expect(body).toContain(NO_PERMISSION)
      expect(body).not.toContain(inspection.contactName)
      await expect(inspectionPage(MISSING)).rejects.toThrow('NOT_FOUND')
    }
  })

  it('an abutter list gives the permission page to someone who may not keep abutter lists', async () => {
    for (const who of ['inspector', 'finance', 'records', 'reviewer']) {
      await actAs(who)
      expect(await text(abutterList(listId))).toContain(NO_PERMISSION)
      await expect(abutterList(MISSING)).rejects.toThrow('NOT_FOUND')
    }
  })
})

describe('the site contact phone on an inspection', () => {
  it('shows to those who schedule or record inspections', async () => {
    for (const who of ['inspector', 'staff']) {
      await actAs(who)
      expect(await text(inspectionPage(inspection.id))).toContain(inspection.contactPhone ?? '')
    }
  })

  it('is left off for viewers who neither schedule nor record inspections', async () => {
    for (const who of ['finance', 'records', 'admin']) {
      await actAs(who)
      const body = await text(inspectionPage(inspection.id))
      expect(body).toContain(inspection.contactName)
      expect(body).not.toContain(inspection.contactPhone ?? 'no phone on file')
    }
  })
})
