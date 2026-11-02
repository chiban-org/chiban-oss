import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
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
  await seedDemo(handle.db, signal)
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
  it('the application list shows every seeded application with a link', async () => {
    const page = await html(ApplicationsPage({ searchParams: Promise.resolve({}) }))
    expect(page.match(/href="\/staff\/applications\//g)).toHaveLength(5)
    expect(page).toContain('Under review')
    expect(page).toContain('Suspended by appeal (RSA 676:6)')
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
    expect(page).toContain('Move to decided')
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
    expect(await html(ClockOverridesPage())).toContain('renewal')
    const fees = await html(FeeOverridesPage())
    expect(fees).toContain('Waived')
    expect(fees).toContain('Applied')
  })
})

describe('staff settings pages', () => {
  it('the settings page lists kinds, adopted starters, rules, and the unverified edition', async () => {
    const page = await html(SettingsPage())
    expect(page).toContain('Application types')
    expect(page).toContain('Adopted')
    expect(page).toContain('Edition not verified (before 2024-07-01)')
    expect(page).toContain('RSA 155-A:4 IX')
    expect(page).toContain('Fixed by statute')
  })

  it('a kind page lists its items and a key page shows the editor and version history', async () => {
    const kind = await html(
      SettingsKindPage({ params: Promise.resolve({ kind: 'application_type' }) }),
    )
    expect(kind).toContain('/staff/settings/application_type/BP')
    const key = await html(
      SettingsKeyPage({ params: Promise.resolve({ kind: 'application_type', key: 'BP' }) }),
    )
    expect(key).toContain('Version history')
    expect(key).toContain('Bindings')
    expect(key).toContain('nh.starter.building version 1')
  })

  it('an unknown kind is not found', async () => {
    await expect(SettingsKindPage({ params: Promise.resolve({ kind: 'bogus' }) })).rejects.toThrow(
      'NOT_FOUND',
    )
  })
})
