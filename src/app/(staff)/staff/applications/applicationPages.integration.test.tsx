import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, cutoverRows } from '@/db/schema'
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

const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)
const { default: ApplicationsPage } = await import('@/app/(staff)/staff/applications/page')
const { default: ClockOverridesPage } = await import('@/app/(staff)/staff/overrides/clocks/page')
const { default: FeeOverridesPage } = await import('@/app/(staff)/staff/overrides/fees/page')
const { default: AliasOverridesPage } = await import('@/app/(staff)/staff/overrides/aliases/page')
const { default: SettingsPage } = await import('@/app/(staff)/staff/settings/page')
const { default: SettingsKindPage } = await import('@/app/(staff)/staff/settings/[kind]/page')
const { default: SettingsKeyPage } = await import('@/app/(staff)/staff/settings/[kind]/[key]/page')

const signal = new AbortController().signal
let handle: TestDb
let ids: Record<string, string> = {}

async function html(element: Promise<unknown>): Promise<string> {
  return renderToStaticMarkup((await element) as never)
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const staff = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, 'staff@alderpond.example'),
  })
  state.actor = await loadActor(handle.db, staff?.id ?? '', signal)
  const rows = await handle.db.select().from(applications)
  ids = Object.fromEntries(rows.map((r) => [r.number.split('-')[0] + r.state, r.id]))
})
afterAll(async () => {
  await handle.drop()
})

describe('staff application pages', () => {
  it('the application list shows every seeded application with a link on the All tab', async () => {
    const page = await html(ApplicationsPage({ searchParams: Promise.resolve({ stage: 'all' }) }))
    const seeded = await handle.db.select().from(applications)
    expect(page.match(/href="\/staff\/applications\//g)).toHaveLength(seeded.length)
    expect(page).toContain('Under review')
    expect(page).toContain('Suspended by appeal (RSA 676:6)')
    expect(page).not.toContain('/staff/queue')
  })

  it('the application list sorts from its headers and filters with chips', async () => {
    const page = await html(ApplicationsPage({ searchParams: Promise.resolve({}) }))
    expect(page).toMatch(
      /<th scope="col"[^>]*><a[^>]*href="\/staff\/applications\?sort=number&amp;dir=asc"/,
    )
    expect(page).toMatch(
      /aria-sort="ascending"[^>]*><a[^>]*href="\/staff\/applications\?sort=due&amp;dir=desc"/,
    )
    expect(page).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*>Type</)
    expect(page).not.toContain('Clear all')
    const sorted = await html(
      ApplicationsPage({ searchParams: Promise.resolve({ sort: 'number', stage: 'issued' }) }),
    )
    expect(sorted).toMatch(
      /aria-sort="ascending"[^>]*><a[^>]*href="\/staff\/applications\?sort=number&amp;stage=issued&amp;dir=desc"/,
    )
    expect(sorted).not.toContain('Clear all')
    expect(sorted).toMatch(/<nav[^>]*aria-label="Status"/)
    expect(sorted).toMatch(/<a[^>]*href="\/staff\/applications\?sort=number"[^>]*>Needs action</)
    expect(sorted).toMatch(
      /<a[^>]*href="\/staff\/applications\?sort=number&amp;stage=all"[^>]*>All</,
    )
    expect(sorted).toMatch(
      /<a aria-current="page"[^>]*href="\/staff\/applications\?sort=number&amp;stage=issued">Issued or suspended</,
    )
    const numbers = [...sorted.matchAll(/href="\/staff\/applications\/[^"]+"[^>]*>([^<]+)</g)].map(
      (m) => m[1],
    )
    expect(numbers.length).toBeGreaterThan(0)
    expect(numbers).toEqual([...numbers].sort())
    expect(sorted).not.toContain('>Draft<')
  })

  it('seeded application page renders every clock with a non-empty consequence', async () => {
    const rows = await handle.db.select().from(applications)
    for (const row of rows) {
      const page = await html(
        ApplicationPage({ params: Promise.resolve({ applicationId: row.id }) }),
      )
      const articles = page.split('<article').slice(1)
      for (const article of articles) {
        const consequence = /If missed<\/dt><dd>([^<]*)</.exec(article)?.[1] ?? ''
        expect(consequence.length).toBeGreaterThan(10)
      }
      expect(page).toContain(row.number)
    }
  })

  it('the building permit in review shows its clock, the waived fee, and the next step', async () => {
    const id = ids.BPunder_review
    const rows = await handle.db.select().from(applications)
    const review = rows.find((r) => r.state === 'under_review' && r.number.startsWith('BP'))
    const page = await html(
      ApplicationPage({ params: Promise.resolve({ applicationId: review?.id ?? id ?? '' }) }),
    )
    expect(page).toContain('Building permit decision deadline')
    expect(page).toContain('Before decided')
    expect(page).toMatch(/assigned reviews? (is|are) not signed off|No reviewer is assigned/)
    expect(page).toContain('Waived (was $')
  })

  it('the suspended permit shows the appeal and the RSA 676:6 label', async () => {
    const rows = await handle.db.select().from(applications)
    const suspended = rows.find((r) => r.state === 'suspended')
    const page = await html(
      ApplicationPage({ params: Promise.resolve({ applicationId: suspended?.id ?? '' }) }),
    )
    expect(page).toContain('Suspended by appeal (RSA 676:6)')
    expect(page).toContain('Abutter at 12 Pond Road')
    expect(page).toContain('Resolve appeal')
  })

  it('an imported application shows its number from the prior system and others do not', async () => {
    const imported = await handle.db.select().from(cutoverRows)
    const first = imported[0]
    if (first === undefined) throw new Error('no imported application seeded')
    const page = await html(
      ApplicationPage({ params: Promise.resolve({ applicationId: first.applicationId }) }),
    )
    expect(page).toMatch(
      new RegExp(`Number in the prior system</dt><dd[^>]*>${first.legacyNumber}</dd>`),
    )
    const importedIds = new Set(imported.map((r) => r.applicationId))
    const native = (await handle.db.select().from(applications)).find((a) => !importedIds.has(a.id))
    const other = await html(
      ApplicationPage({ params: Promise.resolve({ applicationId: native?.id ?? '' }) }),
    )
    expect(other).not.toContain('Number in the prior system')
  })

  it('an unknown application is not found', async () => {
    await expect(
      ApplicationPage({
        params: Promise.resolve({ applicationId: '00000000-0000-4000-8000-000000000000' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      ApplicationPage({ params: Promise.resolve({ applicationId: 'nope' }) }),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('the clock and fee override views list the seeded adjustment and waiver', async () => {
    const noSearch = { searchParams: Promise.resolve({}) }
    const clocks = await html(ClockOverridesPage(noSearch))
    expect(clocks).toContain('<td>Renewal</td>')
    expect(clocks).not.toContain('View application')
    expect(clocks).toMatch(/href="\/staff\/applications\/[^"]+">[A-Z]+-\d{4}-\d{4}<\/a>/)
    expect(clocks).toContain('<main data-wide="">')
    expect(clocks).toContain('table-panel')
    expect(clocks).toContain('Newest first. Click a column heading to sort.')
    const fees = await html(FeeOverridesPage(noSearch))
    expect(fees).toContain('Waived')
    expect(fees).toContain('Applied')
    expect(fees).toContain('Newest first. Click a column heading to sort.')
    expect(fees).not.toMatch(/<td>[a-z_]+<\/td>/)
  })

  it('offers the add-override form only to staff who can manage parcels', async () => {
    const noSearch = { searchParams: Promise.resolve({}) }
    const staffView = await html(AliasOverridesPage(noSearch))
    expect(staffView).toContain('Save override')
    expect(staffView).toContain('Newest first. Click a column heading to sort.')
    const viewer = state.actor
    const finance = await handle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, 'finance@alderpond.example'),
    })
    state.actor = await loadActor(handle.db, finance?.id ?? '', signal)
    const financeView = await html(AliasOverridesPage(noSearch))
    state.actor = viewer
    expect(financeView).toContain('Parcel ID overrides')
    expect(financeView).not.toContain('Save override')
    expect(financeView).not.toContain('Add an override')
  })
})

describe('staff settings pages', () => {
  it('the settings page lists kinds, adopted starters, rules, and the unverified edition', async () => {
    const page = await html(SettingsPage({ searchParams: Promise.resolve({}) }))
    expect(page).toContain('Application types')
    expect(page).toMatch(/<summary[^>]*>\d+ starters? adopted<\/summary>/)
    expect(page).toContain('Edition not verified (before July 1, 2024)')
    expect(page).not.toContain('1970')
    expect(page).toContain('RSA 155-A:4 IX')
    expect(page).toContain('Fixed by statute')
  })

  it('a kind page lists its items and a key page shows the editor and version history', async () => {
    const kind = await html(
      SettingsKindPage({
        params: Promise.resolve({ kind: 'application_type' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(kind).toContain('/staff/settings/application_type/BP')
    const clerk = state.actor
    const admin = await handle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, 'admin@alderpond.example'),
    })
    state.actor = await loadActor(handle.db, admin?.id ?? '', signal)
    const key = await html(
      SettingsKeyPage({ params: Promise.resolve({ kind: 'application_type', key: 'BP' }) }),
    )
    state.actor = clerk
    expect(key).toContain('Version history')
    expect(key).toContain('Bindings')
    expect(key).toContain('Building or demolition permit starter, version 2')
    expect(key).not.toContain('nh.starter.building')
  })

  it('an unknown kind is not found', async () => {
    await expect(
      SettingsKindPage({
        params: Promise.resolve({ kind: 'bogus' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NOT_FOUND')
  })
})
