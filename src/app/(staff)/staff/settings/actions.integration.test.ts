import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { configVersions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { publishConfig } from '@/features/config/publish'
import { listKeysOfKind } from '@/features/config/settingsViews'
import { getPublished, listVersions } from '@/features/config/store'
import { appTypeBody, FORM_BODY } from '@/test/configFixtures'
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
const starterActions = await import('@/app/(staff)/staff/settings/starterActions')

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
beforeEach(() => {
  state.csrfCookie = 'tok'
})

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const formBodyFields = (key: string) => ({
  kind: 'form',
  key,
  body: JSON.stringify({ ...FORM_BODY, key }),
})

const ALL = {
  saveDraftAction: actions.saveDraftAction,
  publishAction: actions.publishAction,
  rollbackAction: actions.rollbackAction,
  adoptStarterAction: starterActions.adoptStarterAction,
  startDraftAction: actions.startDraftAction,
  discardDraftAction: actions.discardDraftAction,
}

describe('settings actions', () => {
  it.each(Object.entries(ALL))('%s rejects a missing csrf token', async (_n, action) => {
    state.actor = await staffActor(handle.db, 'admin')
    expect(await action(form({}, null))).toMatchObject({
      ok: false,
      error: expect.stringContaining('session expired'),
    })
  })

  it.each(Object.entries(ALL))('%s rejects a signed-out caller', async (_n, action) => {
    state.actor = null
    expect(await action(form({}))).toMatchObject({ ok: false, error: 'Sign in to continue.' })
  })

  it('publish action as staff without config.edit is forbidden', async () => {
    state.actor = await staffActor(handle.db, 'staff')
    const result = await actions.publishAction(form(formBodyFields('staff-form')))
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { _form: expect.stringContaining('permission') },
    })
    expect(await getPublished(handle.db, 'form', 'staff-form', signal)).toBeNull()
  })

  it('starting a draft as staff without config.edit is forbidden and saves nothing', async () => {
    state.actor = await staffActor(handle.db, 'staff')
    const result = await actions.startDraftAction(form({ kind: 'template', key: 'staff-letter' }))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
    const keys = (await listKeysOfKind(handle.db, 'template', signal)).map((k) => k.key)
    expect(keys).not.toContain('staff-letter')
  })

  it('discarding a draft as staff without config.edit is forbidden and keeps the draft', async () => {
    const admin = await staffActor(handle.db, 'admin')
    state.actor = admin
    await actions.saveDraftAction(form(formBodyFields('discard-guarded')))
    state.actor = await staffActor(handle.db, 'staff')
    const result = await actions.discardDraftAction(form(formBodyFields('discard-guarded')))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
    expect(await listVersions(handle.db, 'form', 'discard-guarded', signal)).toHaveLength(1)
  })

  it('discarding the only draft of a list item returns to its list', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    await actions.saveDraftAction(form(formBodyFields('discard-lone')))
    await expect(
      actions.discardDraftAction(form({ kind: 'form', key: 'discard-lone' })),
    ).rejects.toThrow('NEXT_REDIRECT:/staff/settings/form')
    expect(await listVersions(handle.db, 'form', 'discard-lone', signal)).toEqual([])
  })

  it('discarding a draft over a published version stays on the page', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    await actions.publishAction(form(formBodyFields('discard-over')))
    await actions.saveDraftAction(form(formBodyFields('discard-over')))
    expect(await actions.discardDraftAction(form({ kind: 'form', key: 'discard-over' }))).toEqual({
      ok: true,
      message: 'Draft discarded.',
    })
    const versions = await listVersions(handle.db, 'form', 'discard-over', signal)
    expect(versions.map((v) => v.status)).toEqual(['published'])
  })

  it('publish action without csrf token is refused', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    const result = await actions.publishAction(form(formBodyFields('no-token-form'), null))
    expect(result).toMatchObject({ ok: false })
    expect(await getPublished(handle.db, 'form', 'no-token-form', signal)).toBeNull()
  })

  it('applying starter changes with nothing ticked says to select a change', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    expect(await starterActions.applyStarterPathsAction(form({}))).toEqual({
      ok: false,
      error: 'Select at least one change to apply.',
    })
  })

  it('an admin saves a draft and then publishes it', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    expect(await actions.saveDraftAction(form(formBodyFields('f1')))).toMatchObject({ ok: true })
    expect((await listVersions(handle.db, 'form', 'f1', signal))[0]?.status).toBe('draft')
    expect(await actions.publishAction(form(formBodyFields('f1')))).toMatchObject({
      ok: true,
      message: 'Published version 1.',
    })
    expect((await getPublished(handle.db, 'form', 'f1', signal))?.version).toBe(1)
  })

  it('publishing an application type missing a mandatory binding returns the error for the bindings field', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    for (const [kind, key, body] of [['form', 'bp-form', FORM_BODY]] as const) {
      await actions.publishAction(form({ kind, key, body: JSON.stringify(body) }))
    }
    const weak = appTypeBody({
      bindings: ['nh.appeal.suspension'],
      formKey: 'bp-form',
      feeScheduleKey: 'x',
      conditionLibraryKey: 'y',
      templateKeys: [],
    })
    const result = await actions.publishAction(
      form({ kind: 'application_type', key: 'BP', body: JSON.stringify(weak) }),
    )
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { bindings: expect.stringContaining('Building permit decision deadline') },
    })
  })

  it('an invalid body returns field errors and a body that is not JSON is refused', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    const bad = await actions.saveDraftAction(
      form({
        kind: 'form',
        key: 'bad',
        body: JSON.stringify({ key: 'bad', label: 'x', fields: [] }),
      }),
    )
    expect(bad).toMatchObject({ ok: false, fieldErrors: { fields: expect.any(String) } })
    expect(
      await actions.saveDraftAction(form({ kind: 'form', key: 'bad', body: 'not json' })),
    ).toEqual({
      ok: false,
      error: 'The settings could not be read. Reload the page and try again.',
      fieldErrors: { body: 'The settings could not be read. Reload the page and try again.' },
    })
    expect(
      await actions.saveDraftAction(form({ kind: 'nonsense', key: 'bad', body: '{}' })),
    ).toMatchObject({ ok: false })
  })

  it('rollback copies an old version forward', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    await actions.publishAction(form(formBodyFields('f2')))
    await actions.publishAction(
      form({
        kind: 'form',
        key: 'f2',
        body: JSON.stringify({ ...FORM_BODY, key: 'f2', label: 'Second' }),
      }),
    )
    const result = await actions.rollbackAction(form({ kind: 'form', key: 'f2', toVersion: '1' }))
    expect(result).toMatchObject({ ok: true, message: 'Rolled back to version 1 as version 3.' })
    expect((await getPublished(handle.db, 'form', 'f2', signal))?.version).toBe(3)
  })

  it('adopting a starter publishes it once and says so on the second try', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    expect(
      await starterActions.adoptStarterAction(form({ starterId: 'nh.starter.electrical' })),
    ).toMatchObject({ ok: true })
    expect(
      await starterActions.adoptStarterAction(form({ starterId: 'nh.starter.electrical' })),
    ).toMatchObject({ ok: false, error: expect.stringContaining('already') })
    state.actor = await staffActor(handle.db, 'staff')
    expect(
      await starterActions.adoptStarterAction(form({ starterId: 'nh.starter.plumbing' })),
    ).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
  })

  it('starting a new item saves a skeleton draft and redirects to its editor', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    await expect(
      actions.startDraftAction(form({ kind: 'template', key: 'my-letter' })),
    ).rejects.toThrow('NEXT_REDIRECT:/staff/settings/template/my-letter')
    expect((await listVersions(handle.db, 'template', 'my-letter', signal))[0]?.status).toBe(
      'draft',
    )
  })
  describe('config keys', () => {
    const BAD_KEY = 'Bad Key!'

    it.each([
      'saveDraftAction',
      'publishAction',
    ] as const)('%s refuses a key with spaces or punctuation and stores nothing', async (name) => {
      state.actor = await staffActor(handle.db, 'admin')
      const result = await actions[name](form(formBodyFields(BAD_KEY)))
      expect(result).toMatchObject({ ok: false, fieldErrors: { key: expect.any(String) } })
      expect(await listVersions(handle.db, 'form', BAD_KEY, signal)).toHaveLength(0)
    })

    it('startDraftAction refuses a bad key with a message about the key', async () => {
      state.actor = await staffActor(handle.db, 'admin')
      const result = await actions.startDraftAction(form({ kind: 'form', key: BAD_KEY }))
      expect(result).toMatchObject({ ok: false, fieldErrors: { key: expect.any(String) } })
      expect(await listVersions(handle.db, 'form', BAD_KEY, signal)).toHaveLength(0)
    })

    it('publishing a stored draft whose key is invalid is refused', async () => {
      state.actor = await staffActor(handle.db, 'admin')
      await handle.db.insert(configVersions).values({
        kind: 'form',
        key: BAD_KEY,
        version: 1,
        status: 'draft',
        body: { ...FORM_BODY, key: BAD_KEY },
        createdBy: (state.actor as Actor).userId,
      })
      const [row] = await listVersions(handle.db, 'form', BAD_KEY, signal)
      const published = await publishConfig(handle.db, state.actor as Actor, row?.id ?? '', signal)
      expect(published.ok).toBe(false)
    })
  })

  it('publish refused for lack of capability says so instead of reporting draft errors', async () => {
    state.actor = await staffActor(handle.db, 'staff')
    const result = await actions.publishAction(form(formBodyFields('staff-form-2')))
    expect(result).toEqual({
      ok: false,
      error: 'You do not have permission to do this.',
      fieldErrors: { _form: expect.stringContaining('permission') },
    })
  })
})
