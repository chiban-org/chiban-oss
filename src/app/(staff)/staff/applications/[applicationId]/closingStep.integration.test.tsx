import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, inspections } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps, useDemoStoryClock } from '@/test/demoSeedDeps'
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
const number = 'BP-2026-0005'
let handle: TestDb
let applicationId = ''
let staff: Awaited<ReturnType<typeof loadActor>> = null

async function render(): Promise<string> {
  state.actor = staff
  return renderToStaticMarkup(
    (await ApplicationPage({ params: Promise.resolve({ applicationId }) })) as never,
  )
}

async function addFinal(status: 'requested' | 'passed' | 'failed'): Promise<string> {
  const [template] = await handle.db.select().from(inspections).limit(1)
  if (template === undefined) throw new Error('no template inspection')
  const { id: _id, ...rest } = template
  const [row] = await handle.db
    .insert(inspections)
    .values({
      ...rest,
      applicationId,
      inspectionType: 'final',
      isFinal: true,
      status,
      reinspectionOf: null,
      inspectorUserId: null,
      scheduledDate: null,
      startMinute: null,
      durationMinutes: null,
      resultRecordedAt: status === 'requested' ? null : new Date(),
    })
    .returning({ id: inspections.id })
  return row?.id ?? ''
}

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, await demoSeedDeps())
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, 'staff@alderpond.example'),
  })
  staff = await loadActor(handle.db, user?.id ?? '', signal)
  const [row] = await handle.db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.number, number))
  applicationId = row?.id ?? ''
  await handle.db
    .update(applications)
    .set({ state: 'issued' })
    .where(eq(applications.id, applicationId))
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('an issued permit that closes on a certificate with no inspections', () => {
  it('sends the clerk to take the final inspection request, not to issue the certificate', async () => {
    const html = await render()
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).toContain('Book the final inspection')
    expect(card).toContain('Take the final inspection request')
    expect(card).toContain(`href="/staff/inspections?number=${number}"`)
    expect(card).not.toContain('Issue the certificate of occupancy')
    expect(card).not.toContain('Issue date')
  })

  it('says in the requirements that the final has to pass first', async () => {
    const requirements = sectionOf(await render(), 'Requirements') ?? ''
    expect(requirements).toContain(
      'No final inspection has passed, so the certificate of occupancy cannot be issued yet.',
    )
  })
})

describe('the same permit after a final inspection is requested', () => {
  it('waits on the inspector and offers no request link', async () => {
    await addFinal('requested')
    const card = sectionOf(await render(), 'Do this now') ?? ''
    expect(card).toContain('Finish the final inspection')
    expect(card).not.toContain('Take the final inspection request')
    expect(card).not.toContain('Issue date')
  })
})

describe('the same permit after the final inspection passes', () => {
  it('puts the certificate form in Do this now and not again in the Inspections panel', async () => {
    await handle.db
      .update(inspections)
      .set({ status: 'passed', resultRecordedAt: new Date() })
      .where(eq(inspections.applicationId, applicationId))
    const html = await render()
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).toContain('Issue the certificate of occupancy')
    expect(card).toContain('name="issuedOn"')
    expect(card).toContain('name="expectedRowVersion"')
    expect(card).toContain(`name="applicationId" value="${applicationId}"`)
    expect(card).not.toContain('Take the final inspection request')
    expect(html.split('name="issuedOn"').length - 1).toBe(1)
    expect(sectionOf(html, 'Inspections') ?? '').not.toContain('name="issuedOn"')
    expect(sectionOf(html, 'Requirements') ?? '').toContain(
      'No certificate of occupancy has been issued.',
    )
  })
})
