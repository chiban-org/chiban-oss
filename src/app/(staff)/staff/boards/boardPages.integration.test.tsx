import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { abutterLists, applications } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { boardIdOf } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findRawKeys } from '@/test/leaks'

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
vi.mock('@/components/abutters/ProjectionMap', () => ({
  ProjectionMap: ({ overlay }: { overlay: { features: unknown[] } }) => (
    <div data-testid="projection-map">{`${overlay.features.length} drawn features`}</div>
  ),
}))

const { default: BoardsPage } = await import('@/app/(staff)/staff/boards/page')
const { default: MeetingsPage } = await import('@/app/(staff)/staff/boards/meetings/page')
const { default: PacketsPage } = await import('@/app/(staff)/staff/boards/packets/page')
const { default: NoticeContactsPage } = await import('@/app/(staff)/staff/notice-contacts/page')
const { default: ListPage } = await import('@/app/(staff)/staff/abutters/[listId]/page')
const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const signal = new AbortController().signal
const noSearch = { searchParams: Promise.resolve({}) }
const NO_PERMISSION = 'You do not have permission'
let handle: TestDb
let issuedListId = ''
let draftListId = ''
let boardApplicationId = ''

const RAW_KEYS = [
  'abutter_owner',
  'condo_association_officer',
  'mhp_owner',
  'mhp_tenant',
  'restriction_holder',
  'sealed_professional',
  'regional_planning_commission',
  'affected_municipality',
  'nh_des',
  'across_between_points',
  'across_within_capture',
  'staff_selected',
  'adjacent',
  'needs_decision',
  'incomplete_data',
  'planning_board',
  'verified_mail',
  'certified_mail',
  'first_class_mail',
  'not_accepted_incomplete',
  'notice_costs_unpaid',
  'parcel_record',
  'association_roster',
  'park_roster',
  'at_notice',
  'under_review',
  'within_500ft',
  'not_within',
  'not_applicable',
]

async function actAs(email: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${email}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

function text(element: unknown): string {
  return renderToStaticMarkup(element as never)
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/\s+/g, ' ')
}

async function page(element: Promise<unknown>): Promise<string> {
  return text(await element)
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const lists = await handle.db.select().from(abutterLists)
  issuedListId = lists.find((l) => l.status === 'issued')?.id ?? ''
  draftListId = lists.find((l) => l.status === 'draft')?.id ?? ''
  const rows = await handle.db.select().from(applications)
  boardApplicationId =
    rows.find((a) => a.id === lists.find((l) => l.status === 'draft')?.applicationId)?.id ?? ''
})
afterAll(async () => {
  await handle.drop()
})

describe('board section pages refuse with the permission page', () => {
  it('a reviewer gets the permission page on boards, meetings, and notice contacts', async () => {
    await actAs('reviewer')
    expect(await page(BoardsPage(noSearch))).toContain(NO_PERMISSION)
    expect(await page(MeetingsPage(noSearch))).toContain(NO_PERMISSION)
    expect(await page(NoticeContactsPage(noSearch))).toContain(NO_PERMISSION)
  })

  it('an inspector gets the permission page on boards and notice contacts', async () => {
    await actAs('inspector')
    expect(await page(BoardsPage(noSearch))).toContain(NO_PERMISSION)
    expect(await page(NoticeContactsPage(noSearch))).toContain(NO_PERMISSION)
  })

  it('a list opened by id gives a reviewer and a board member the permission page', async () => {
    for (const who of ['reviewer', 'board']) {
      await actAs(who)
      const body = await page(ListPage({ params: Promise.resolve({ listId: issuedListId }) }))
      expect(body).toContain('You do not have permission to see abutter lists.')
      await expect(
        page(
          ListPage({ params: Promise.resolve({ listId: '00000000-0000-4000-8000-000000000000' }) }),
        ),
      ).rejects.toThrow('NOT_FOUND')
    }
  })

  it('a list id that is not a uuid is missing', async () => {
    await actAs('staff')
    await expect(page(ListPage({ params: Promise.resolve({ listId: 'nope' }) }))).rejects.toThrow(
      'NOT_FOUND',
    )
  })

  it('a signed-out visitor is sent to sign in', async () => {
    state.actor = null
    await expect(page(BoardsPage(noSearch))).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
    await expect(page(NoticeContactsPage(noSearch))).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })
})

describe('board pages show words, not keys or dates', () => {
  it('boards, meetings, and rosters', async () => {
    await actAs('staff')
    for (const body of [
      await page(BoardsPage(noSearch)),
      await page(MeetingsPage(noSearch)),
      await page(NoticeContactsPage(noSearch)),
    ]) {
      expect(findIsoDates(body)).toEqual([])
      expect(findRawKeys(body, RAW_KEYS)).toEqual([])
    }
    const boards = await page(BoardsPage(noSearch))
    expect(boards).toContain('Board applications')
    expect(boards).toContain('oldest filing first')
    expect(boards).not.toContain('Meeting calendar')
    expect(boards).toContain('Alder Pond Planning Board')
    expect(boards).toContain('November 25, 2026')
    expect(boards).toContain('October 25, 2026 (overdue)')
  })

  it('boards that only comment list what was sent to them instead of an empty table', async () => {
    await actAs('staff')
    const boards = await page(BoardsPage(noSearch))
    expect(boards).toContain('Alder Pond Conservation Commission')
    expect(boards).toContain('Sent for comment')
    expect(boards).toContain('Demo permit: Barn conversion under appeal')
    expect(boards).toContain('Comments received. Comments by November 20, 2026.')
    expect(boards).toContain('Waiting for comments. Comments by November 27, 2026.')
    expect(boards).toContain(
      'This board comments on applications and does not decide them. Nothing has been sent to it for comment.',
    )
    expect(boards.match(/No applications are waiting on this board/g)).toBeNull()
  })

  it('boards share one sort and one set of quick filters across both tables', async () => {
    await actAs('staff')
    const sorted = renderToStaticMarkup(
      (await BoardsPage({
        searchParams: Promise.resolve({ sort: 'deadline', dir: 'desc' }),
      })) as never,
    )
    expect(sorted.match(/aria-sort="descending"/g)?.length).toBe(
      sorted.match(/<table/g)?.length ?? 0,
    )
    expect(sorted).toContain('Quick filters')
    const overdue = await page(BoardsPage({ searchParams: Promise.resolve({ due: 'overdue' }) }))
    expect(overdue).toContain('October 25, 2026 (overdue)')
    const none = await page(BoardsPage({ searchParams: Promise.resolve({ due: 'none' }) }))
    expect(none).not.toContain('(overdue)')
  })

  it('the meeting calendar opens on upcoming meetings, soonest first, with tab counts', async () => {
    await actAs('staff')
    const upcoming = await page(MeetingsPage(noSearch))
    expect(upcoming).toMatch(/Upcoming \d+/)
    expect(upcoming).toMatch(/Past \d+/)
    expect(upcoming).not.toContain('July 8, 2026')
    expect(upcoming.indexOf('November 12, 2026')).toBeLessThan(upcoming.indexOf('December 9, 2026'))
    expect(upcoming.split('Alder Pond Town Hall, Meeting Room 2').length).toBeLessThanOrEqual(2)
    const past = await page(MeetingsPage({ searchParams: Promise.resolve({ when: 'past' }) }))
    expect(past).toContain('July 8, 2026')
    expect(past.indexOf('October 28, 2026')).toBeLessThan(past.indexOf('July 8, 2026'))
    const zba = await page(
      MeetingsPage({ searchParams: Promise.resolve({ board: await boardIdOf(handle.db, 'zba') }) }),
    )
    expect(zba).toContain('November 17, 2026')
    expect(zba).not.toContain('November 12, 2026')
  })

  it('the packets page is a read-only list of upcoming meetings and refuses with the shared permission page', async () => {
    await actAs('staff')
    const html = renderToStaticMarkup((await PacketsPage(noSearch)) as never)
    expect(html).not.toContain('<form')
    expect(html).toMatch(/href="\/staff\/boards\/meetings\/[0-9a-f-]{36}#packet"/)
    await actAs('reviewer')
    const refused = renderToStaticMarkup((await PacketsPage(noSearch)) as never)
    expect(refused).toContain(NO_PERMISSION)
    expect(refused).toContain('href="/staff"')
  })

  it('the notice contacts page links each parcel and the park owner in their own columns', async () => {
    await actAs('staff')
    const html = renderToStaticMarkup((await NoticeContactsPage(noSearch)) as never)
    expect(html).toMatch(/href="\/staff\/parcels\/[0-9a-f-]{36}"/)
    expect(html).toMatch(/href="\/staff\/parcels\?q=[^"]+"/)
    expect(text(html)).not.toMatch(/, parcel \d/)
    expect(text(html)).not.toMatch(/ on parcel \d/)
    expect(html).toContain('<th scope="col">Parcel</th>')
  })

  it('the notice contacts page shows the regional and state contacts read-only', async () => {
    await actAs('staff')
    const staffView = await page(NoticeContactsPage(noSearch))
    expect(staffView).toContain('Regional and state contacts')
    expect(staffView).toContain(
      'Used only when an application has regional impact or is within 500 feet under NH DES rules.',
    )
    expect(staffView).toContain(
      'Alder Valley Regional Planning Commission, 18 Commission Way, Alder Valley NH 03999',
    )
    expect(staffView).toContain('Town of Pine River, 4 Town Hall Road, Pine River NH 03000')
    expect(staffView).toContain('NH Department of Environmental Services')
    expect(staffView).toContain('An administrator changes these in Settings.')
    await actAs('admin')
    const adminView = renderToStaticMarkup((await NoticeContactsPage(noSearch)) as never)
    expect(adminView).toContain('href="/staff/settings/regional_contacts"')
  })

  it('the issued list shows provenance, source age, and the labels links', async () => {
    await actAs('staff')
    const body = await page(ListPage({ params: Promise.resolve({ listId: issuedListId }) }))
    expect(findIsoDates(body)).toEqual([])
    expect(findRawKeys(body, RAW_KEYS)).toEqual([])
    expect(body).toMatch(/Parcel layer imported [A-Z][a-z]+ \d+, \d{4}/)
    expect(body).toContain('Print mailing labels')
    expect(body).toContain('Touches the property')
    expect(body).toContain('Check code')
    expect(body).not.toContain('Fingerprint')
  })

  it('the list page keeps status, check code, cost and labels in the rail and links each parcel', async () => {
    await actAs('staff')
    const markup = renderToStaticMarkup(
      (await ListPage({ params: Promise.resolve({ listId: issuedListId }) })) as never,
    )
    const rail = markup.slice(markup.indexOf('<aside'), markup.indexOf('</aside>'))
    expect(rail).toContain('Check code')
    expect(rail).toContain('aria-label="Notice cost"')
    expect(rail).toContain('>Avery 5160<')
    expect(rail).toContain('>Avery 5163<')
    const considered = markup.slice(markup.indexOf('aria-label="Parcels considered"'))
    expect(considered).toMatch(/href="\/staff\/parcels\/[0-9a-f-]{36}"/)
    expect(considered).toContain('href="/staff/parcels?q=')
  })

  it('the draft list shows an undecided tenant, a reason in words, and one filled action', async () => {
    await actAs('staff')
    const element = await ListPage({ params: Promise.resolve({ listId: draftListId }) })
    const body = text(element)
    expect(body).toContain('Before this list can be issued')
    expect(body).toContain('Needs a staff decision')
    expect(findIsoDates(body)).toEqual([])
    expect(findRawKeys(body, RAW_KEYS)).toEqual([])
    expect(body).toContain('Issue list')
  })

  it('seeded list page renders no empty provenance cell', async () => {
    await actAs('staff')
    const markup = renderToStaticMarkup(
      (await ListPage({ params: Promise.resolve({ listId: issuedListId }) })) as never,
    )
    expect(markup).not.toMatch(/<ul class="[^"]*"><\/ul>/)
    expect(markup).not.toContain('undefined')
    expect(markup).not.toContain('null')
  })

  it('the application page shows the board panel with words and no keys', async () => {
    await actAs('staff')
    const body = await page(
      ApplicationPage({ params: Promise.resolve({ applicationId: boardApplicationId }) }),
    )
    expect(body).toContain('Alder Pond Zoning Board of Adjustment')
    expect(body).toContain('Abutter lists')
    expect(findIsoDates(body)).toEqual([])
    expect(findRawKeys(body, RAW_KEYS)).toEqual([])
  })
})
