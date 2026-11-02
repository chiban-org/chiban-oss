import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
  adoptStarterAction: actions.adoptStarterAction,
  startDraftAction: actions.startDraftAction,
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

  it('publish action without csrf token is refused', async () => {
    state.actor = await staffActor(handle.db, 'admin')
    const result = await actions.publishAction(form(formBodyFields('no-token-form'), null))
    expect(result).toMatchObject({ ok: false })
    expect(await getPublished(handle.db, 'form', 'no-token-form', signal)).toBeNull()
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
      fieldErrors: { bindings: expect.stringContaining('nh.bp.decision') },
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
    ).toMatchObject({ ok: false, error: expect.stringContaining('Check') })
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
      await actions.adoptStarterAction(form({ starterId: 'nh.starter.electrical' })),
    ).toMatchObject({ ok: true })
    expect(
      await actions.adoptStarterAction(form({ starterId: 'nh.starter.electrical' })),
    ).toMatchObject({ ok: false, error: expect.stringContaining('already') })
    state.actor = await staffActor(handle.db, 'staff')
    expect(
      await actions.adoptStarterAction(form({ starterId: 'nh.starter.plumbing' })),
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
})
