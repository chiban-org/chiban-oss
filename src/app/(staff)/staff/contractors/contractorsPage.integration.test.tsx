import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { saveContractorProfile } from '@/features/contractors/profile'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { visibleText } from '@/test/leaks'
import { staffWith } from '@/test/staffUsers'

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
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ContractorsPage } = await import('@/app/(staff)/staff/contractors/page')

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDefaultGrants(handle.db, signal)
  const id = await makeUser(handle.db, { role: 'applicant', email: 'pat@builder.example' })
  await saveContractorProfile(
    handle.db,
    (await loadActor(handle.db, id, signal)) as Actor,
    {
      name: 'Pat Builder',
      phone: '603-555-0142',
      mailingAddress: null,
      companyName: 'Builder and Sons',
      trades: ['electrical'],
      licenses: [{ trade: 'electrical', number: 'EL-20418' }],
    },
    signal,
  )
})
afterAll(async () => {
  await handle.drop()
})

async function render(q?: string): Promise<string> {
  const element = await ContractorsPage({
    searchParams: Promise.resolve(q === undefined ? {} : { q }),
  })
  return visibleText(renderToStaticMarkup(element))
}

describe('staff contractors page', () => {
  it('lists the contractor with trades, license numbers and contact details', async () => {
    state.actor = await staffWith(handle.db, ['staff'])
    const text = await render()
    expect(text).toContain('Builder and Sons')
    expect(text).toContain('pat@builder.example, 603-555-0142')
    expect(text).toContain('Electrical EL-20418')
  })

  it('says when a search matches nobody', async () => {
    state.actor = await staffWith(handle.db, ['staff'])
    expect(await render('nobody here')).toContain('No contractors match.')
  })

  it('tells an inspector they cannot see the list', async () => {
    state.actor = await staffWith(handle.db, ['inspector'])
    const text = await render()
    expect(text).not.toContain('Builder and Sons')
    expect(text).toContain('contractor list')
  })
})
