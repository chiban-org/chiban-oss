import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { projectParties } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'

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
}))

const { default: ContractorDashboardPage } = await import('@/app/(public)/portal/contractor/page')

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let trade: TradeFixture
let contractor: Actor
let stranger: Actor

async function actorFor(email: string): Promise<Actor> {
  const id = await makeUser(handle.db, { role: 'applicant', email })
  return (await loadActor(handle.db, id, signal)) as Actor
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
  trade = await submittedTrade(handle.db, world)
  await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-06-20' })
  contractor = await actorFor('pat@builder.example')
  stranger = await actorFor('nobody@builder.example')
  await handle.db.insert(projectParties).values({
    projectId: world.projectId,
    userId: contractor.userId,
    email: 'pat@builder.example',
    name: 'Pat Builder',
    role: 'contractor',
    addedBy: contractor.userId,
  })
})
afterAll(async () => {
  await handle.drop()
})

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(await ContractorDashboardPage({ searchParams: Promise.resolve(params) }))

describe('contractor dashboard page', () => {
  it('sends a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/sign-in?next=%2Fportal%2Fcontractor')
  })

  it('opens with a Needs you section that links the balance to the application', async () => {
    state.actor = contractor
    const html = await render()
    expect(html).toContain('Needs you')
    expect(html).toContain('balance due $45.00')
    expect(html).toContain(`href="/portal/applications/${trade.applicationId}#fees-heading"`)
  })

  it('leads each project with its address in an h3 and keeps the type and number as a link', async () => {
    state.actor = contractor
    const html = await render()
    expect(html).toMatch(/<h3[^>]*>[^<]*<span[^>]*>Garage addition<\/span><\/h3>/)
    expect(html).toContain(`>Electrical permit ${trade.number}</a>`)
    expect(html).toContain('Parcel ')
  })

  it('offers a filled Start an application button', async () => {
    state.actor = contractor
    expect(await render()).toContain('href="/portal/apply"')
  })

  it('counts each status tab and keeps only matching applications when one is chosen', async () => {
    state.actor = contractor
    const html = await render({ status: 'issued' })
    expect(html).toContain('aria-current="page"')
    expect(html).not.toContain(`>Electrical permit ${trade.number}</a>`)
    expect(html).toContain('>Building permit BP-2027-0001</a>')
    expect(html).toContain('In review')
  })

  it('narrows to a searched application number', async () => {
    state.actor = contractor
    const html = await render({ q: trade.number })
    expect(html).toContain(`>Electrical permit ${trade.number}</a>`)
    expect(html).not.toContain('>Building permit BP-2027-0001</a>')
    const none = await render({ q: 'nothing-like-this' })
    expect(none).toContain('Nothing matches.')
  })

  it('tells someone with no projects what to do', async () => {
    state.actor = stranger
    const html = await render()
    expect(html).toContain('nobody@builder.example')
    expect(html).toContain('Give the town the email this account uses')
    expect(html).toContain('href="/portal/apply"')
    expect(html).not.toContain('Needs you')
  })
})
