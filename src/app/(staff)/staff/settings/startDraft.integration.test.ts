import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { listKeysOfKind } from '@/features/config/settingsViews'
import { listVersions } from '@/features/config/store'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

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
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
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

const actions = await import('@/app/(staff)/staff/settings/actions')

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('starting a new settings item by name', () => {
  it('makes the short name from the name and puts the name in the draft', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    await expect(
      actions.startDraftAction(form({ kind: 'inspection_checklist', label: 'Footing inspection' })),
    ).rejects.toThrow('NEXT_REDIRECT:/staff/settings/inspection_checklist/footing-inspection')
    const [draft] = await listVersions(
      handle.db,
      'inspection_checklist',
      'footing-inspection',
      signal,
    )
    expect(draft?.body).toMatchObject({ label: 'Footing inspection', inspectionType: 'footing' })
  })

  it('adds a number when another item already has that short name', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    await expect(
      actions.startDraftAction(form({ kind: 'inspection_checklist', label: 'Footing inspection' })),
    ).rejects.toThrow('NEXT_REDIRECT:/staff/settings/inspection_checklist/footing-inspection-2')
    const keys = (await listKeysOfKind(handle.db, 'inspection_checklist', signal)).map((k) => k.key)
    expect(keys).toEqual(['footing-inspection', 'footing-inspection-2'])
  })

  it('refuses a typed short name that is taken and leaves the existing draft alone', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    const result = await actions.startDraftAction(
      form({ kind: 'inspection_checklist', label: 'Other', key: 'footing-inspection' }),
    )
    expect(result).toMatchObject({ ok: false, fieldErrors: { key: expect.any(String) } })
    const [draft] = await listVersions(
      handle.db,
      'inspection_checklist',
      'footing-inspection',
      signal,
    )
    expect(draft?.body).toMatchObject({ label: 'Footing inspection' })
  })

  it('asks for a name when none is given', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    const result = await actions.startDraftAction(form({ kind: 'form', label: ' ' }))
    expect(result).toMatchObject({ ok: false, fieldErrors: { label: 'Enter a name.' } })
  })
})
