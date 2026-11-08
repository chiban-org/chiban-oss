import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parcels, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('./actions', () => ({
  checkAction: vi.fn(),
  completeAction: vi.fn(),
  quickIssueAction: vi.fn(),
  readerAction: vi.fn(),
  reconnectAction: vi.fn(),
  sendClaimAction: vi.fn(),
}))
vi.mock('./intakeActions', () => ({
  discardIntakeAction: vi.fn(),
  saveIntakeAction: vi.fn(),
  sendApplicantClaimAction: vi.fn(),
  startIntakeAction: vi.fn(),
  submitIntakeAction: vi.fn(),
}))

const { default: CounterPage } = await import('./page')

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  state.actor = world.staff
})
afterAll(async () => {
  await handle.drop()
})

async function page(params: { q?: string; parcel?: string; type?: string; applicant?: string }) {
  return renderToStaticMarkup(await CounterPage({ searchParams: Promise.resolve(params) }))
}

describe('counter steps', () => {
  it('starts with only the permit type tiles', async () => {
    const html = await page({})
    expect(html).toContain('Electrical')
    expect(html).toContain('href="/staff/counter?type=EL"')
    expect(html).not.toContain('name="q"')
    expect(html).not.toContain('Contractor name')
  })

  it('lists every published type in two groups and no longer sends walk-ins to the portal', async () => {
    const html = await page({})
    expect(html).toContain('Issue today')
    expect(html).toContain('Take for review')
    const [issueToday, takeForReview] = html.split('Take for review')
    expect(issueToday).toContain('href="/staff/counter?type=EL"')
    expect(issueToday).not.toContain('href="/staff/counter?type=BP"')
    expect(takeForReview).toContain('href="/staff/counter?type=BP"')
    expect(html).not.toContain('started by the applicant')
    expect(html).not.toContain('href="/portal/apply"')
  })

  it('asks for the parcel and then the applicant for a type taken for review', async () => {
    const parcelStep = await page({ type: 'BP' })
    expect(parcelStep).toContain('Find the parcel the application is for.')
    expect(parcelStep).toContain('Application type')
    expect(parcelStep).toContain('name="q"')
    const applicantStep = await page({ type: 'BP', parcel: world.parcelId })
    expect(applicantStep).toContain('Find the applicant, then take the application with them.')
    expect(applicantStep).toContain('Applicant email')
    expect(applicantStep).toContain('The applicant has no email address')
    expect(applicantStep).not.toContain('Contractor name')
  })

  it('says the application will belong to an applicant who has an account', async () => {
    const [row] = await handle.db
      .select({ email: users.email, name: users.displayName })
      .from(users)
      .where(eq(users.id, world.applicant.userId))
    const html = await page({ type: 'BP', parcel: world.parcelId, applicant: row?.email ?? '' })
    expect(html).toContain(`${row?.name} has an account with this email.`)
    expect(html).toContain(`Take the application for ${row?.name}`)
  })

  it('lists an unfinished counter application with who started it', async () => {
    const started = await startCounterIntake(
      handle.db,
      world.staff,
      {
        parcelId: world.parcelId,
        applicationTypeKey: 'BP',
        applicant: { name: 'Morgan Reyes', email: 'morgan.reyes@alderpond.example' },
      },
      new AbortController().signal,
    )
    if (!started.ok) throw new Error('start failed')
    const html = await page({})
    expect(html).toContain('Unfinished at the counter')
    expect(html).toContain('Building permit for Morgan Reyes')
    expect(html).toContain(`href="/staff/counter/take/${started.value.applicationId}"`)
    expect(html).toContain(`Discard ${started.value.number}`)
  })

  it('offers to record a walk-in by name when no account uses the email', async () => {
    const html = await page({
      type: 'BP',
      parcel: world.parcelId,
      applicant: 'walk.in@alderpond.example',
    })
    expect(html).toContain('No account uses walk.in@alderpond.example.')
    expect(html).toContain('Applicant name')
    expect(html).toContain('Take the application')
  })

  it('changes the lead line as the steps are chosen', async () => {
    expect(await page({})).toContain('Choose what the applicant came in for, then find the parcel.')
    const typed = await page({ type: 'EL' })
    expect(typed).toContain('Find the parcel the permit is for.')
    expect(typed).not.toContain('Choose what the applicant came in for')
    const full = await page({ type: 'EL', parcel: world.parcelId })
    expect(full).toContain('Fill in the details, take payment, then issue and print the permit.')
    expect(full).not.toContain('find the parcel.')
  })

  it('ignores a parcel until a permit type is chosen, and keeps it for the type tile', async () => {
    const html = await page({ parcel: world.parcelId })
    expect(html).not.toContain('name="q"')
    expect(html).not.toContain('Contractor name')
    expect(html).toContain(`href="/staff/counter?parcel=${world.parcelId}&amp;type=EL"`)
  })

  it('after a type shows the chosen type with Change and the parcel search only', async () => {
    const html = await page({ type: 'EL' })
    expect(html).toContain('name="q"')
    expect(html).toContain('Electrical')
    expect(html).toMatch(/<a[^>]*href="\/staff\/counter"[^>]*>Change/)
    expect(html).not.toContain('href="/staff/counter?type=EL"')
    expect(html).not.toContain('Contractor name')
  })

  it('after a parcel shows both choices with Change and the rest of the form', async () => {
    const html = await page({ type: 'EL', parcel: world.parcelId, q: 'Elm' })
    expect(html).not.toContain('name="q"')
    expect(html).toContain('Contractor name')
    expect(html).toContain('Issue and print')
    expect(html).toMatch(/<a[^>]*href="\/staff\/counter\?q=Elm&amp;type=EL"[^>]*>Change/)
    expect(html).toMatch(/<a[^>]*href="\/staff\/counter"[^>]*>Change/)
  })

  it('defaults the license type to the one that fits the permit type', async () => {
    const html = await page({ type: 'EL', parcel: world.parcelId })
    expect(html).toMatch(/<option[^>]*value="Master electrician"[^>]*selected/)
    expect(html).not.toContain('value="Electrical permit"')
  })
})

describe('counter parcel search', () => {
  it('shows no key hints', async () => {
    const html = renderToStaticMarkup(await CounterPage({ searchParams: Promise.resolve({}) }))
    expect(html).not.toContain('data-slot="key-hints"')
    expect(html).not.toContain('<kbd')
  })

  it('says so when nothing matches', async () => {
    const html = renderToStaticMarkup(
      await CounterPage({ searchParams: Promise.resolve({ type: 'EL', q: 'zzzzzz nothing' }) }),
    )
    expect(html).toContain('No parcels match')
  })

  it('says nothing about matches before a search is made', async () => {
    const html = await page({ type: 'EL' })
    expect(html).not.toContain('No parcels match')
  })

  it('asks for two characters when the search is too short', async () => {
    const html = renderToStaticMarkup(
      await CounterPage({ searchParams: Promise.resolve({ type: 'EL', q: 'a' }) }),
    )
    expect(html).toContain('Enter at least two characters')
  })

  it('shows the site address next to the selected parcel ID', async () => {
    await handle.db
      .update(parcels)
      .set({ siteAddress: '12 Elm Road' })
      .where(eq(parcels.id, world.parcelId))
    const html = renderToStaticMarkup(
      await CounterPage({ searchParams: Promise.resolve({ type: 'EL', parcel: world.parcelId }) }),
    )
    expect(html).toContain('12 Elm Road')
  })

  it('offers a one-click example search that stays on the counter', async () => {
    await handle.db
      .update(parcels)
      .set({ siteAddress: '12 Elm Road' })
      .where(eq(parcels.id, world.parcelId))
    const html = await page({ type: 'EL' })
    expect(html).toMatch(/Try<\/span><a href="\/staff\/counter\?type=EL&amp;q=12%20Elm%20Road"/)
  })

  it('says a hit has no site address instead of leaving a bare ID', async () => {
    const [other] = await handle.db
      .insert(parcels)
      .values({ siteAddress: null, ownerName: 'Zed Nameless' })
      .returning({ id: parcels.id })
    const html = renderToStaticMarkup(
      await CounterPage({ searchParams: Promise.resolve({ type: 'EL', q: 'Nameless' }) }),
    )
    expect(other).toBeDefined()
    expect(html).toContain('No site address')
  })
})
