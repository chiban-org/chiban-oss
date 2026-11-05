import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { boardMeetings, meetingMinutes } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { visibleText } from '@/test/leaks'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
  store: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null, store: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/features/storage/objectStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/storage/objectStore')>()
  return { ...original, getObjectStore: () => state.store }
})

const actions = await import('./minutesActions')
const { default: MeetingPage } = await import('./page')
const { default: PublicMeetingsPage } = await import('@/app/(public)/meetings/page')

const HELD = '2026-04-08'
let handle: TestDb
let world: BoardWorld
let store: ObjectStore
let meetingId: string

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, { pbMeetings: [HELD] })
  store = (await makeTestStore()).store
  state.store = store
  const [row] = await handle.db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(eq(boardMeetings.meetingDate, HELD))
  meetingId = row?.id ?? ''
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

async function minutesDocument(title: string): Promise<string> {
  const made = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'meeting', id: meetingId },
    pdfBytes(title),
    { title, filename: 'minutes.pdf' },
  )
  return made.documentId
}

const INTENT = {
  title: 'Minutes',
  filename: 'm.pdf',
  contentType: 'application/pdf',
  sizeBytes: '10',
}

describe('minutes actions', () => {
  it('are refused for staff who lack the capability', async () => {
    const documentId = await minutesDocument('Minutes of April 8')
    state.actor = await staffActor(handle.db, 'records_custodian')
    const intent = await actions.createMeetingUploadIntentAction(
      form({ ...INTENT, targetKind: 'meeting', targetId: meetingId }),
    )
    expect(intent.ok).toBe(false)
    state.actor = world.reviewer
    expect(
      (await actions.recordMinutesAction(form({ meetingId, documentId, status: 'draft' }))).ok,
    ).toBe(false)
    state.actor = world.admin
    expect(
      (
        await actions.recordMinutesAction(
          form({ meetingId, documentId, status: 'approved', approvedOn: '2026-04-22' }),
        )
      ).ok,
    ).toBe(false)
    expect(await handle.db.select().from(meetingMinutes)).toEqual([])
  })

  it('approved minutes show on the meeting page and on the public meetings page', async () => {
    const documentId = await minutesDocument('Minutes of the April 8 meeting')
    state.actor = world.staff
    expect(
      await actions.recordMinutesAction(
        form({ meetingId, documentId, status: 'approved', approvedOn: '2026-04-22' }),
      ),
    ).toEqual({ ok: true, message: 'Approved minutes recorded. They are now public.' })
    const staffHtml = visibleText(
      renderToStaticMarkup(await MeetingPage({ params: Promise.resolve({ meetingId }) })),
    )
    expect(staffHtml).toContain('Minutes of the April 8 meeting . Approved April 22, 2026. Public.')
    expect(staffHtml).not.toContain('Upload the minutes')
    state.actor = null
    const publicHtml = renderToStaticMarkup(
      await PublicMeetingsPage({ searchParams: Promise.resolve({}) }),
    )
    expect(publicHtml).toContain(`href="/api/documents/${documentId}"`)
    expect(visibleText(publicHtml)).toContain(
      'Minutes: Planning Board, April 8, 2026, approved April 22, 2026',
    )
  })
})
