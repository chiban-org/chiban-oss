import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { complaints, enforcementCases } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { getPublicParcelView } from '@/features/parcels/publicParcelView'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  ENFORCEMENT_ENUM_KEYS,
  findIsoDates,
  findRawKeys,
  findUuids,
  visibleText,
} from '@/test/leaks'

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

const { default: QueuePage } = await import('@/app/(staff)/staff/enforcement/page')
const { default: CasePage } = await import('@/app/(staff)/staff/enforcement/[caseId]/page')
const { default: AnonymousAdminPage } = await import(
  '@/app/(staff)/staff/admin/anonymous-intake/page'
)

const { default: OfficersPage } = await import(
  '@/app/(staff)/staff/admin/enforcement-officers/page'
)

const signal = new AbortController().signal
let handle: TestDb
let caseIds: { id: string; number: string }[] = []

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

const html = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as never)
const noSearch = { searchParams: Promise.resolve({}) }

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  caseIds = (await handle.db.select().from(enforcementCases)).map((c) => ({
    id: c.id,
    number: c.number,
  }))
})
afterAll(async () => {
  await handle.drop()
})

describe('enforcement queue and case pages', () => {
  it('lists the seeded cases with a stay chip and a next date for staff', async () => {
    await actAs('staff')
    const page = await html(QueuePage(noSearch))
    for (const c of caseIds) expect(page).toContain(c.number)
    expect(page).toContain('Stayed')
    expect(page).toContain('Answer due')
  })

  it('board members get the permission page on the queue and not-found on a case by id', async () => {
    await actAs('board')
    expect(await html(QueuePage(noSearch))).toContain('You do not have permission')
    await expect(
      html(CasePage({ params: Promise.resolve({ caseId: caseIds[0]?.id ?? '' }) })),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('a reviewer cannot open a private case by id and a resident is sent to sign in', async () => {
    await actAs('reviewer')
    await expect(
      html(CasePage({ params: Promise.resolve({ caseId: caseIds[0]?.id ?? '' }) })),
    ).rejects.toThrow('NOT_FOUND')
    await actAs('applicant')
    await expect(
      html(CasePage({ params: Promise.resolve({ caseId: caseIds[0]?.id ?? '' }) })),
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('a malformed case id is not found', async () => {
    await actAs('staff')
    await expect(html(CasePage({ params: Promise.resolve({ caseId: 'nope' }) }))).rejects.toThrow(
      'NOT_FOUND',
    )
  })

  it.each([
    0, 1, 2, 3, 4, 5, 6,
  ])('case page %i shows no raw keys, ISO dates, or ids', async (index) => {
    await actAs('staff')
    const target = caseIds[index]
    if (target === undefined) return
    const text = visibleText(
      await html(CasePage({ params: Promise.resolve({ caseId: target.id }) })),
    )
    expect(findIsoDates(text)).toEqual([])
    expect(findUuids(text)).toEqual([])
    expect(findRawKeys(text, ENFORCEMENT_ENUM_KEYS)).toEqual([])
  })

  it('the queue shows no raw keys, ISO dates, or ids', async () => {
    await actAs('staff')
    const text = visibleText(await html(QueuePage(noSearch)))
    expect(findIsoDates(text)).toEqual([])
    expect(findUuids(text)).toEqual([])
    expect(findRawKeys(text, ENFORCEMENT_ENUM_KEYS)).toEqual([])
  })

  it('the stayed case shows the stay banner and the court gate in words', async () => {
    await actAs('staff')
    const pages = await Promise.all(
      caseIds.map(async (c) => html(CasePage({ params: Promise.resolve({ caseId: c.id }) }))),
    )
    expect(pages.some((p) => p.includes('Enforcement stayed by appeal to the ZBA filed'))).toBe(
      true,
    )
    expect(pages.some((p) => p.includes('(RSA 676:6)'))).toBe(true)
    expect(pages.some((p) => p.includes('The motion to enforce cannot be filed yet.'))).toBe(true)
  })

  it('the owner served case shows the unserved tenant as a text label and the answer due date', async () => {
    await actAs('staff')
    const pages = await Promise.all(
      caseIds.map(async (c) =>
        visibleText(await html(CasePage({ params: Promise.resolve({ caseId: c.id }) }))),
      ),
    )
    const served = pages.find((p) => p.includes('Robin Renter'))
    expect(served).toContain('Not served')
    expect(served).toContain('Service is not complete.')
    expect(served).toContain('days left')
  })

  it('the judgment case shows the fine with its balance and the estimated exposure label', async () => {
    await actAs('finance')
    const pages = await Promise.all(
      caseIds.map(async (c) =>
        visibleText(await html(CasePage({ params: Promise.resolve({ caseId: c.id }) }))),
      ),
    )
    const court = pages.find((p) => p.includes('Balance due $75.00'))
    expect(court).toContain('$275.00')
    expect(court).toContain('Paid $200.00.')
    expect(court).toContain(
      'Estimated statutory exposure for counsel. Nothing is owed unless a court imposes it.',
    )
  })

  it('the complainant identity is shown to staff and never leaves the case page', async () => {
    await actAs('staff')
    const pages = await Promise.all(
      caseIds.map(async (c) =>
        visibleText(await html(CasePage({ params: Promise.resolve({ caseId: c.id }) }))),
      ),
    )
    expect(pages.some((p) => p.includes('Jordan Neighbor'))).toBe(true)
    await actAs('applicant')
    const parcel = await resolveParcelId(handle.db, { value: '007001000000' }, signal)
    if (!parcel.ok) throw new Error('parcel')
    const publicView = await getPublicParcelView(
      handle.db,
      parcel.value.parcelId,
      new Date(),
      signal,
    )
    const serialized = JSON.stringify(publicView)
    for (const secret of [
      'Jordan Neighbor',
      'jordan.neighbor',
      '603-555-0117',
      'auto repair business',
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(serialized).toContain(
      'A business is reported to be operating from a residential garage.',
    )
  })

  it('the public parcel page lists the public case and not the private ones', async () => {
    const parcel = await resolveParcelId(handle.db, { value: '007001000000' }, signal)
    if (!parcel.ok) throw new Error('parcel')
    const publicView = await getPublicParcelView(
      handle.db,
      parcel.value.parcelId,
      new Date(),
      signal,
    )
    const text = JSON.stringify(publicView)
    const publicCase = (await handle.db.select().from(enforcementCases)).find((c) => c.isPublic)
    expect(text).toContain(publicCase?.number ?? 'missing')
    for (const c of (await handle.db.select().from(enforcementCases)).filter((x) => !x.isPublic)) {
      expect(text).not.toContain(c.number)
    }
  })

  it('anonymous complaints store no identity at all', async () => {
    const rows = await handle.db.select().from(complaints)
    for (const row of rows.filter((r) => r.channel === 'anonymous_web')) {
      expect(row.complainantName).toBeNull()
      expect(row.complainantEmail).toBeNull()
      expect(row.createdBy).toBeNull()
    }
  })

  it('the anonymous intake admin page needs the capability and explains the closed state', async () => {
    await actAs('staff')
    expect(await html(AnonymousAdminPage())).toContain('You do not have permission')
    await actAs('admin')
    const page = await html(AnonymousAdminPage())
    expect(page).toContain('Anonymous complaints are not being accepted')
    expect(page).toContain('no passing retention check')
    expect(page).toContain('No retention check has been recorded.')
  })

  it('administrators can see and add designated enforcement officers, staff cannot', async () => {
    await actAs('staff')
    expect(await html(OfficersPage())).toContain('You do not have permission')
    await actAs('admin')
    const page = visibleText(await html(OfficersPage()))
    expect(page).toContain('Sam Clerk, Code Enforcement Officer. Designated by Select Board on')
    expect(findIsoDates(page)).toEqual([])
    expect(findUuids(page)).toEqual([])
  })
})
