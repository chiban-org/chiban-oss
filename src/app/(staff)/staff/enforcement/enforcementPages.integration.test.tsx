import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  complaints,
  documents,
  enforcementCases,
  enforcementOrders,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { draftOrder } from '@/features/enforcement/orders'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { getPublicParcelView } from '@/features/parcels/publicParcelView'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { formatCivilDate } from '@/lib/formatDate'
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

  it('board members and records custodians get the permission page on the queue and on a case by id', async () => {
    for (const who of ['board', 'records']) {
      await actAs(who)
      expect(await html(QueuePage(noSearch))).toContain('You do not have permission')
      const existing = await html(
        CasePage({ params: Promise.resolve({ caseId: caseIds[0]?.id ?? '' }) }),
      )
      const missing = await html(
        CasePage({ params: Promise.resolve({ caseId: '00000000-0000-4000-8000-000000000000' }) }),
      )
      expect(existing).toContain('You do not have permission to see code enforcement cases.')
      expect(existing).not.toContain(caseIds[0]?.number ?? 'no case number')
      expect(missing).toBe(existing)
    }
  })

  it('a reviewer cannot open a private case by id and a resident is sent to sign in', async () => {
    await actAs('reviewer')
    expect(
      await html(CasePage({ params: Promise.resolve({ caseId: caseIds[0]?.id ?? '' }) })),
    ).toContain('You do not have permission')
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
      caseIds.map(async (c) => await html(CasePage({ params: Promise.resolve({ caseId: c.id }) }))),
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

  it('the judgment case shows the fine with its balance and an exposure label that does not deny the fine is owed', async () => {
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
      'Estimated statutory exposure for counsel. Only the fines a court imposed, listed above, are owed.',
    )
    expect(court).not.toContain('Nothing is owed unless a court imposes it.')
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

  it('the public case on the parcel page carries its dates, provisions, and issued order numbers', async () => {
    const parcel = await resolveParcelId(handle.db, { value: '007001000000' }, signal)
    if (!parcel.ok) throw new Error('parcel')
    const publicView = await getPublicParcelView(
      handle.db,
      parcel.value.parcelId,
      new Date(),
      signal,
    )
    const publicCase = (await handle.db.select().from(enforcementCases)).find((c) => c.isPublic)
    if (publicCase === undefined) throw new Error('no public case')
    const text = JSON.stringify(publicView)
    expect(text).toContain(`Opened ${formatCivilDate(publicCase.openedOn)}`)
    const findings = await handle.db
      .select()
      .from(violationFindings)
      .where(eq(violationFindings.caseId, publicCase.id))
    for (const f of findings) expect(text).toContain(f.provisionRef)
    const orders = await handle.db
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.caseId, publicCase.id))
    for (const o of orders.filter((x) => x.issuedOn !== null)) expect(text).toContain(o.number)
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
    expect(page).toContain('The public page says anonymous reports are not available')
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

  it('a reviewer opening the officers page is told about that page', async () => {
    await actAs('reviewer')
    const page = visibleText(await html(OfficersPage()))
    expect(page).toContain('You do not have permission to designate enforcement officers.')
  })

  it('the officers page offers only people who may issue orders and can end a designation', async () => {
    await actAs('admin')
    const markup = await html(OfficersPage())
    const select = markup.slice(markup.indexOf('name="userId"'), markup.indexOf('</select>'))
    const names = [...select.matchAll(/<option[^>]*>([^<]*)</g)].map((m) => m[1])
    expect(names).toContain('Sam Clerk')
    for (const role of ['finance', 'board']) {
      const user = await handle.db.query.users.findFirst({
        where: (u, { eq: equals }) => equals(u.email, `${role}@alderpond.example`),
      })
      expect(names).not.toContain(user?.displayName)
    }
    expect(visibleText(markup)).toContain('End this designation')
  })

  it('a draft order without a deadline can be completed or discarded from the case page', async () => {
    await actAs('staff')
    const [finding] = await handle.db
      .select()
      .from(violationFindings)
      .where(eq(violationFindings.status, 'open'))
      .limit(1)
    if (finding === undefined) throw new Error('no open finding')
    const drafted = await draftOrder(
      handle.db,
      state.actor as Actor,
      {
        caseId: finding.caseId,
        findingIds: [finding.id],
        correctiveAction: 'Remove the shed.',
        correctiveDeadline: null,
        ceaseImmediately: false,
      },
      signal,
    )
    if (!drafted.ok) throw new Error(drafted.error)
    const page = visibleText(
      await html(CasePage({ params: Promise.resolve({ caseId: finding.caseId }) })),
    )
    expect(page).toContain('Save the draft')
    expect(page).toContain('Discard the draft')
  })

  it('a case photo can be approved for the public from the case page', async () => {
    await actAs('staff')
    const [photo] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.recordKind, 'enforcement_case'))
      .limit(1)
    if (photo === undefined) throw new Error('no case document')
    const page = visibleText(
      await html(CasePage({ params: Promise.resolve({ caseId: photo.recordId }) })),
    )
    expect(page).toContain('Approve for the public')
  })

  it('a notice of violation says how it was sent in a sentence', async () => {
    await actAs('staff')
    const notices = await handle.db.select().from(violationNotices)
    expect(notices.length).toBeGreaterThan(0)
    for (const caseId of new Set(notices.map((n) => n.caseId))) {
      const page = visibleText(await html(CasePage({ params: Promise.resolve({ caseId }) })))
      expect(page).not.toMatch(/ by (handed|posted)/i)
      expect(page).toMatch(
        /(Handed to the recipient|Sent by [a-z ]+|Posted on the property) on [A-Z][a-z]+ \d{1,2}, \d{4}\./,
      )
    }
  })
})
