import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { documentVersions, rtkRequests } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { openCase } from '@/features/enforcement/cases'
import { recordComplaint } from '@/features/enforcement/complaints'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition } from '@/features/renditions/approvals'
import { createRelease } from '@/features/rtk/releases'
import { closeRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import { makeTestDb, type TestDb } from '@/test/db'
import { visibleText } from '@/test/leaks'
import { makeTestStore } from '@/test/minio'
import type { CivilDate } from '@/types/civilDate'

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

const { default: RequestPage } = await import(
  '@/app/(staff)/staff/records/requests/[requestId]/page'
)
const { default: RetentionPage } = await import('@/app/(staff)/staff/records/retention/page')
const { default: HoldsPage } = await import('@/app/(staff)/staff/records/holds/page')
const { default: PreservationPage } = await import('@/app/(staff)/staff/records/preservation/page')
const { default: QueuePage } = await import('@/app/(staff)/staff/enforcement/page')

const signal = new AbortController().signal
let handle: TestDb

async function actAs(local: string): Promise<Actor> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  state.actor = actor
  return actor as Actor
}

const html = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as never)
const search = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) })

async function openRequest() {
  const [request] = await handle.db.select().from(rtkRequests).where(eq(rtkRequests.status, 'open'))
  if (request === undefined) throw new Error('no open request in the demo seed')
  return request
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
})
afterAll(async () => {
  await handle.drop()
})

describe('Right-to-Know request page by role', () => {
  it('administrators and inspectors get the permission refusal on the request page', async () => {
    const request = await openRequest()
    for (const role of ['admin', 'inspector']) {
      await actAs(role)
      const markup = await html(
        RequestPage({ params: Promise.resolve({ requestId: request.id }), ...search() }),
      )
      const text = visibleText(markup)
      expect(text).toContain('You do not have permission to see Right-to-Know requests')
      expect(text).not.toContain(request.number)
      expect(markup).not.toContain('<form')
    }
  })

  it('records custodians get the working forms folded behind buttons', async () => {
    const request = await openRequest()
    await actAs('records')
    const markup = await html(
      RequestPage({ params: Promise.resolve({ requestId: request.id }), ...search() }),
    )
    expect(markup).toContain('<summary>Record a withholding</summary>')
    expect(markup).toContain('<summary>Record the first response</summary>')
    expect(markup).toContain('<summary>Close the request</summary>')
  })

  it('the server refuses every request action to an administrator', async () => {
    const request = await openRequest()
    const admin = await actAs('admin')
    const { store } = await makeTestStore()
    const today = '2026-11-02' as CivilDate
    const forbidden = { ok: false, error: 'forbidden' }
    expect(
      await recordWithholding(
        handle.db,
        admin,
        {
          requestId: request.id,
          scope: 'withheld_in_full',
          recordDescription: 'Attorney email',
          exemptionKey: 'nh.rtk.91a5.xii',
          explanation: 'A confidential communication seeking legal advice from counsel.',
        },
        signal,
      ),
    ).toEqual(forbidden)
    expect(
      await recordFirstResponse(
        handle.db,
        store,
        admin,
        { requestId: request.id, kind: 'denied', respondedOn: today },
        signal,
      ),
    ).toEqual(forbidden)
    expect(
      await closeRequest(
        handle.db,
        admin,
        { requestId: request.id, to: 'closed', expectedRowVersion: request.rowVersion },
        signal,
      ),
    ).toEqual(forbidden)
    expect(
      await createRelease(
        handle.db,
        store,
        createMemoryTransport(),
        admin,
        {
          requestId: request.id,
          releasedOn: today,
          method: 'paper',
          items: [{ documentId: crypto.randomUUID(), approvalId: crypto.randomUUID() }],
        },
        signal,
      ),
    ).toEqual(forbidden)
    const [version] = await handle.db.select().from(documentVersions).limit(1)
    expect(
      await approveRendition(
        handle.db,
        admin,
        {
          versionId: version?.id ?? '',
          purpose: 'rtk_release',
          rtkRequestId: request.id,
          reviewStatement: 'Checked',
        },
        signal,
      ),
    ).toEqual(forbidden)
  })
})

describe('enforcement queue by role', () => {
  it('an administrator without enforcement.manage gets no case or complaint forms', async () => {
    await actAs('admin')
    const text = visibleText(await html(QueuePage(search())))
    expect(text).toContain('Code enforcement')
    expect(text).not.toContain('Open a case')
    expect(text).not.toContain('Enter a complaint')
    await actAs('staff')
    const staff = visibleText(await html(QueuePage(search())))
    expect(staff).toContain('Open a case')
    expect(staff).toContain('Enter a complaint')
  })

  it('the server refuses a new case and a staff entered complaint to an administrator', async () => {
    const admin = await actAs('admin')
    expect(await openCase(handle.db, admin, { locationText: '12 Birch Lane' }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await recordComplaint(
        handle.db,
        admin,
        { channel: 'staff_entry', locationText: '12 Birch Lane', description: 'Junk cars' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('retention and the refusal pages', () => {
  it('the on-hold tab links to Legal holds only for people who can open it', async () => {
    await actAs('staff')
    const staff = await html(RetentionPage(search({ state: 'on_hold' })))
    expect(staff).not.toContain('href="/staff/records/holds"')
    expect(visibleText(staff)).toContain('A records custodian manages legal holds')
    await actAs('records')
    const custodian = await html(RetentionPage(search({ state: 'on_hold' })))
    expect(custodian).toContain('href="/staff/records/holds"')
  })

  it('a refusal offers a way back to the start page and holds and preservation use the same wording', async () => {
    await actAs('inspector')
    const retention = await html(RetentionPage(search()))
    expect(retention).toContain('You do not have permission to see the retention worklist.')
    expect(retention).toContain('href="/staff"')
    const holds = await html(HoldsPage(search()))
    expect(holds).toContain('You do not have permission to manage legal holds.')
    expect(holds).toContain('href="/staff"')
    await actAs('reviewer')
    const preservation = await html(PreservationPage())
    expect(preservation).toContain('You do not have permission to see the preservation queue.')
    expect(preservation).toContain('href="/staff"')
  })
})
