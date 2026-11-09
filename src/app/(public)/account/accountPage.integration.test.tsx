import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { projectParties } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { saveContractorProfile } from '@/features/contractors/profile'
import { setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

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

const { default: AccountPage } = await import('@/app/(public)/account/page')

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
})
afterAll(async () => {
  await handle.drop()
})

const render = async (setup?: string) =>
  renderToStaticMarkup(
    await AccountPage({ searchParams: Promise.resolve(setup === undefined ? {} : { setup }) }),
  )

describe('account page', () => {
  it('sends a signed-out visitor to sign in and back', async () => {
    state.actor = null
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/sign-in?next=%2Faccount')
  })

  it('sends town staff to their staff account page', async () => {
    state.actor = await staffActor(handle.db, 'staff')
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/staff/account')
  })

  it('shows an applicant their details and a way to become a contractor', async () => {
    state.actor = await staffActor(handle.db, 'applicant')
    const html = await render()
    expect(html).toContain('Your details')
    expect(html).toContain('Mailing address')
    expect(html).toContain('href="/account?setup=contractor"')
    expect(html).not.toContain('Company name')
  })

  it('shows the contractor form with the four NH trades when setting up', async () => {
    state.actor = await staffActor(handle.db, 'applicant')
    const html = await render('contractor')
    expect(html).toContain('Company name')
    for (const label of ['Electrical', 'Plumbing', 'Fuel gas fitting', 'Oil heating']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Set up the contractor profile')
    expect(html).not.toContain('insurance')
  })

  it('fills the saved contractor profile back in', async () => {
    const actor = await staffActor(handle.db, 'applicant')
    await saveContractorProfile(
      handle.db,
      actor,
      {
        name: 'Pat Builder',
        phone: '603-555-0142',
        mailingAddress: null,
        companyName: 'Builder and Sons',
        trades: ['plumbing'],
        licenses: [{ trade: 'plumbing', number: 'PL-3301' }],
      },
      signal,
    )
    state.actor = actor
    const html = await render()
    expect(html).toContain('value="Builder and Sons"')
    expect(html).toContain('value="PL-3301"')
    expect(html).toContain('Save the contractor profile')
  })
  it('leaves the contact name empty for a profile that has not been saved', async () => {
    state.actor = await staffActor(handle.db, 'applicant')
    expect(await render('contractor')).not.toMatch(/name="name"[^>]*value="User /)
  })

  it('says the email cannot be changed here', async () => {
    state.actor = await staffActor(handle.db, 'applicant')
    expect(await render()).toContain('It cannot be changed here.')
  })

  it('shows a license field only for a trade the saved profile holds', async () => {
    const actor = await staffActor(handle.db, 'applicant')
    await saveContractorProfile(
      handle.db,
      actor,
      {
        name: 'Pat Builder',
        phone: '603-555-0142',
        mailingAddress: null,
        companyName: 'Builder and Sons',
        trades: ['plumbing'],
        licenses: [{ trade: 'plumbing', number: 'PL-3301' }],
      },
      signal,
    )
    state.actor = actor
    const html = await render()
    expect(html).toContain('NH license number, plumbing')
    expect(html).not.toContain('NH license number, electrical')
  })

  it('sends a returning contractor who follows the setup link to their projects', async () => {
    const actor = await staffActor(handle.db, 'applicant')
    await saveContractorProfile(
      handle.db,
      actor,
      {
        name: 'Pat Builder',
        phone: '603-555-0142',
        mailingAddress: null,
        companyName: 'Builder and Sons',
        trades: [],
        licenses: [],
      },
      signal,
    )
    state.actor = actor
    await expect(render('contractor')).rejects.toThrow('NEXT_REDIRECT:/portal/contractor')
  })

  it('shows the contractor profile to someone named as a contractor on a project', async () => {
    const actor = await staffActor(handle.db, 'applicant')
    const world = await setupPermitWorld(handle.db)
    await handle.db.insert(projectParties).values({
      projectId: world.projectId,
      userId: actor.userId,
      email: 'named@builder.example',
      name: 'Named Builder',
      role: 'contractor',
      addedBy: actor.userId,
    })
    state.actor = actor
    const html = await render()
    expect(html).toContain('Contractor profile')
    expect(html).toContain('Company name')
  })
})
