import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

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
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../actions', () => ({
  startDraftAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: KindPage } = await import('./page')

const signal = new AbortController().signal
let handle: TestDb

async function render(actor: Actor, query: Record<string, string> = {}): Promise<string> {
  state.actor = actor
  return renderToStaticMarkup(
    await KindPage({
      params: Promise.resolve({ kind: 'application_type' }),
      searchParams: Promise.resolve(query),
    }),
  )
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  const admin = await staffActor(handle.db, 'admin')
  const adopted = await adoptStarter(handle.db, admin, 'nh.starter.electrical', signal)
  if (!adopted.ok) throw new Error(JSON.stringify(adopted.error))
})
afterAll(async () => {
  await handle.drop()
})

describe('settings kind page', () => {
  it('offers Start a draft only to someone who may edit configuration', async () => {
    for (const role of ['staff', 'records_custodian'] as const) {
      const html = await render(await staffActor(handle.db, role))
      expect(html).not.toContain('Start a new one')
      expect(html).not.toContain('Start a draft')
    }
    expect(await render(await staffActor(handle.db, 'admin'))).toContain('Start a draft')
  })

  it('names each key and states the default order', async () => {
    const html = await render(await staffActor(handle.db, 'staff'))
    expect(html).toContain('Electrical permit')
    expect(html).toContain('By key, A to Z.')
  })

  it('keeps one published choice at a time', async () => {
    const html = await render(await staffActor(handle.db, 'staff'), { published: 'published' })
    expect(html).toContain('href="/staff/settings/application_type?published=unpublished"')
  })
})
