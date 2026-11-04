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

async function render(
  actor: Actor,
  query: Record<string, string> = {},
  kind = 'application_type',
): Promise<string> {
  state.actor = actor
  try {
    return renderToStaticMarkup(
      await KindPage({ params: Promise.resolve({ kind }), searchParams: Promise.resolve(query) }),
    )
  } catch (error) {
    return (error as Error).message
  }
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
  it('offers New type only to someone who may edit configuration', async () => {
    for (const role of ['staff', 'records_custodian'] as const) {
      const html = await render(await staffActor(handle.db, role))
      expect(html).not.toContain('New type')
    }
    expect(await render(await staffActor(handle.db, 'admin'))).toMatch(
      /<button[^>]*>New type<\/button>/,
    )
  })

  it('heads the page with its title, what it controls, and the versioning line', async () => {
    const html = await render(await staffActor(handle.db, 'admin'))
    expect(html).toContain('<h1 class="m-0 mb-1">Application types</h1>')
    expect(html).toContain('The kinds of application the town accepts')
    expect(html).toContain('Open applications keep the version they started under.')
    expect(html).not.toContain('data-wide')
  })

  it('opens a single-record kind straight to its record', async () => {
    const admin = await staffActor(handle.db, 'admin')
    for (const kind of [
      'payment_settings',
      'inspection_settings',
      'board_settings',
      'regional_contacts',
      'review_routes',
    ]) {
      expect(await render(admin, {}, kind)).toBe(`NEXT_REDIRECT:/staff/settings/${kind}/default`)
    }
  })

  it('shows an empty kind as what it does with the add action, not a bare count', async () => {
    const html = await render(await staffActor(handle.db, 'admin'), {}, 'local_code_amendment')
    expect(html).toContain('No local amendments are on file')
    expect(html).toContain('The state building code applies as written.')
    expect(html).toMatch(/<button[^>]*>New amendment<\/button>/)
    expect(html).not.toContain('<table')
    expect(html.match(/>New amendment</g)).toHaveLength(1)
    expect(html).not.toContain('Open applications keep the version')
  })

  it('tells someone who cannot add that an administrator can', async () => {
    const html = await render(await staffActor(handle.db, 'staff'), {}, 'town_rule_setting')
    expect(html).toContain('No town rules are set')
    expect(html).toContain('An administrator can add one.')
    expect(html).not.toContain('Set a town rule')
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
