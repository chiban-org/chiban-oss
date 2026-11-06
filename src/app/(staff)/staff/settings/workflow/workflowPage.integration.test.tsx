import { count } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, clocks } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { type BoardWorld, boardTypeBody, setupBoardWorld } from '@/test/boardFixtures'
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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/server/trpc/context', () => ({
  createContext: () =>
    Promise.resolve({ db: state.db, actor: state.actor, signal: new AbortController().signal }),
}))

const { default: WorkflowPage } = await import('./[key]/page')
const actions = await import('@/app/(staff)/staff/settings/previewActions')

let handle: TestDb
let world: BoardWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const sampleFields = {
  previewReceived: '2027-03-24',
  previewAccepted: '2027-04-14',
  previewMeeting: '2027-04-14',
}

describe('workflow page', () => {
  it('shows the editor and the version history to someone who can edit configuration', async () => {
    state.actor = world.admin
    const html = renderToStaticMarkup(
      await WorkflowPage({ params: Promise.resolve({ key: 'SPR' }) }),
    )
    expect(html).toContain('Workflow for SPR')
    expect(html).toContain('Add a step')
    expect(html).toContain('Version history')
    expect(html).toContain('This kind of proceeding always goes through the board.')
  })

  it('shows the permission page to staff without config.edit', async () => {
    state.actor = await staffActor(handle.db, 'reviewer')
    const html = renderToStaticMarkup(
      await WorkflowPage({ params: Promise.resolve({ key: 'SPR' }) }),
    )
    expect(html).toContain('You do not have permission to change workflows.')
    expect(html).not.toContain('Add a step')
  })

  it('is not found for a type that does not exist', async () => {
    state.actor = world.admin
    await expect(WorkflowPage({ params: Promise.resolve({ key: 'NOPE' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })
})

describe('previewWorkflowAction', () => {
  const body = () => JSON.stringify(boardTypeBody('nh.pb_site_plan', 'SPR', 'SPR'))

  it('returns a preview and writes no applications or clocks', async () => {
    state.actor = world.admin
    const before = [
      (await handle.db.select({ n: count() }).from(applications))[0]?.n,
      (await handle.db.select({ n: count() }).from(clocks))[0]?.n,
    ]
    const result = await actions.previewWorkflowAction(
      form({ kind: 'application_type', key: 'SPR', body: body(), ...sampleFields }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const due = result.preview.steps
        .flatMap((s) => s.clocks)
        .find((c) => c.ruleKey === 'nh.pb.decision')?.due
      expect(due).toBe('2027-06-18')
    }
    expect([
      (await handle.db.select({ n: count() }).from(applications))[0]?.n,
      (await handle.db.select({ n: count() }).from(clocks))[0]?.n,
    ]).toEqual(before)
  })

  it('is refused without a csrf token', async () => {
    state.actor = world.admin
    const result = await actions.previewWorkflowAction(
      form({ kind: 'application_type', key: 'SPR', body: body(), ...sampleFields }, null),
    )
    expect(result.ok).toBe(false)
  })

  it('is forbidden for staff without config.edit', async () => {
    state.actor = await staffActor(handle.db, 'reviewer')
    const result = await actions.previewWorkflowAction(
      form({ kind: 'application_type', key: 'SPR', body: body(), ...sampleFields }),
    )
    expect(result.ok).toBe(false)
  })

  it('rejects a bad body or a missing received date', async () => {
    state.actor = world.admin
    expect(
      (
        await actions.previewWorkflowAction(
          form({ kind: 'application_type', key: 'SPR', body: 'nope' }),
        )
      ).ok,
    ).toBe(false)
    expect(
      (
        await actions.previewWorkflowAction(
          form({ kind: 'application_type', key: 'SPR', body: body() }),
        )
      ).ok,
    ).toBe(false)
  })
})
