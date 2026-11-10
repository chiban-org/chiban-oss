import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, boardMeetings, enforcementCases, parcels } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'

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

const application = await import('@/app/(staff)/staff/applications/[applicationId]/page')
const enforcement = await import('@/app/(staff)/staff/enforcement/[caseId]/page')
const meeting = await import('@/app/(staff)/staff/boards/meetings/[meetingId]/page')
const parcel = await import('@/app/(staff)/staff/parcels/[parcelId]/page')

const signal = new AbortController().signal
const MISSING = '00000000-0000-4000-8000-000000000000'
let handle: TestDb

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function titleOf(
  generate: (props: never) => Promise<{ title?: unknown }>,
  key: string,
  id: string,
) {
  const result = await generate({ params: Promise.resolve({ [key]: id }) } as never)
  return String(result.title)
}

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('record page titles', () => {
  it('name the record for a viewer who may open it', async () => {
    const [app] = await handle.db.select().from(applications).limit(1)
    const [kase] = await handle.db.select().from(enforcementCases).limit(1)
    const [meet] = await handle.db.select().from(boardMeetings).limit(1)
    const [par] = await handle.db.select().from(parcels).limit(1)
    await actAs('staff')
    expect(await titleOf(application.generateMetadata, 'applicationId', app?.id ?? '')).toBe(
      `Application ${app?.number}`,
    )
    expect(await titleOf(enforcement.generateMetadata, 'caseId', kase?.id ?? '')).toBe(
      `Case ${kase?.number}`,
    )
    expect(await titleOf(meeting.generateMetadata, 'meetingId', meet?.id ?? '')).toContain(
      'meeting, ',
    )
    expect(await titleOf(parcel.generateMetadata, 'parcelId', par?.id ?? '')).toMatch(/^Parcel \S/)
  })

  it('stay generic for a viewer who may not open the record', async () => {
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(
        sql`not exists (select 1 from review_assignments ra where ra.application_id = ${applications.id}) and not exists (select 1 from hearings h where h.application_id = ${applications.id})`,
      )
      .limit(1)
    const [kase] = await handle.db.select().from(enforcementCases).limit(1)
    const [meet] = await handle.db.select().from(boardMeetings).limit(1)
    for (const who of ['reviewer', 'board']) {
      await actAs(who)
      expect(await titleOf(application.generateMetadata, 'applicationId', app?.id ?? '')).toBe(
        'Application',
      )
      expect(await titleOf(enforcement.generateMetadata, 'caseId', kase?.id ?? '')).toBe('Case')
      expect(await titleOf(meeting.generateMetadata, 'meetingId', meet?.id ?? '')).toBe('Meeting')
    }
    await actAs('inspector')
    expect(await titleOf(meeting.generateMetadata, 'meetingId', meet?.id ?? '')).toBe('Meeting')
  })

  it('stay generic for a record that does not exist', async () => {
    await actAs('staff')
    expect(await titleOf(application.generateMetadata, 'applicationId', MISSING)).toBe(
      'Application',
    )
    expect(await titleOf(enforcement.generateMetadata, 'caseId', MISSING)).toBe('Case')
    expect(await titleOf(meeting.generateMetadata, 'meetingId', MISSING)).toBe('Meeting')
    expect(await titleOf(parcel.generateMetadata, 'parcelId', MISSING)).toBe('Parcel')
  })
})
