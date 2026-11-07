import { NH_STARTERS } from '@packs/nh/starters'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/constants/roles'
import { errorCopy } from '@/server/actionRunner'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  choice,
  describeActionCases,
  type InvalidVariant,
  int,
  isPublicRole,
  redirectsTo,
  STAFF_REFUSALS,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')
const starterActions = await import('./starterActions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

const NO_PERMISSION = 'You do not have permission to change configuration.'

function formDraftForbidden(role: Role) {
  if (isPublicRole(role)) return STAFF_REFUSALS.signedOut
  return {
    ok: false,
    error: errorCopy('forbidden'),
    fieldErrors: { _form: NO_PERMISSION },
  } as const
}

function plainForbidden(role: Role) {
  return { ok: false, error: errorCopy(isPublicRole(role) ? 'signed_out' : 'forbidden') } as const
}

let counter = 0
function nextKey(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

function formBody(key: string, label = 'Building permit form') {
  return JSON.stringify({ ...FORM_BODY, key, label })
}

function kindAndKey(variant: InvalidVariant) {
  if (variant.field === 'kind') return refuseField('kind', 'Choose a kind of setting.')
  if (variant.field === 'toVersion') {
    return refuseField(
      'toVersion',
      variant.kind === 'missing'
        ? 'Enter a version.'
        : 'Enter a version as a whole number from 1 to 1000000.',
    )
  }
  if (variant.field === 'label') {
    return refuseField('label', 'Enter a name of 200 characters or fewer.')
  }
  return refuseField(
    'key',
    variant.kind === 'too_long'
      ? 'Enter a short name of 64 characters or fewer.'
      : 'Enter a short name.',
  )
}

const KIND_KEY = { kind: choice({ required: true }), key: text({ required: true, max: 64 }) }

describeActionCases(h, 'saveDraftAction', {
  invoke: actions.saveDraftAction,
  actor: () => h.actorFor('admin'),
  input: () => {
    const key = nextKey('save')
    return { kind: 'form', key, body: formBody(key) }
  },
  fields: KIND_KEY,
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    forbidden: formDraftForbidden,
    invalid: kindAndKey,
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Draft saved.' })
    expect(written).toEqual(['audit_log', 'config_versions'])
  },
})

describeActionCases(h, 'publishAction', {
  invoke: actions.publishAction,
  actor: () => h.actorFor('admin'),
  input: () => {
    const key = nextKey('publish')
    return { kind: 'form', key, body: formBody(key) }
  },
  fields: KIND_KEY,
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    forbidden: formDraftForbidden,
    invalid: kindAndKey,
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Put version 1 into use.' })
    expect(written).toEqual(['audit_log', 'config_versions'])
  },
})

describe('saveDraftAction and publishAction body refusals', () => {
  const UNREADABLE = 'The settings could not be read. Reload the page and try again.'

  it.each([
    'saveDraftAction',
    'publishAction',
  ] as const)('%s refuses a body that is not JSON', async (name) => {
    h.signIn(await h.actorFor('admin'))
    const { value, written } = await h.recordWrites(() =>
      actions[name](h.form({ kind: 'form', key: nextKey('x'), body: '{not json' })),
    )
    expect({ value, written }).toEqual({ value: refuseField('body', UNREADABLE), written: [] })
  })

  it('refuses a body left out', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await actions.publishAction(h.form({ kind: 'form', key: nextKey('x') }))
    expect(result).toEqual(refuseField('body', UNREADABLE))
  })
})

async function draftOf(key: string): Promise<void> {
  const admin = await h.actorFor('admin')
  const { saveDraft } = await import('@/features/config/store')
  await saveDraft(
    h.db,
    admin,
    { kind: 'form', key, body: JSON.parse(formBody(key)) },
    new AbortController().signal,
  )
}

describeActionCases(h, 'discardDraftAction', {
  invoke: actions.discardDraftAction,
  actor: () => h.actorFor('admin'),
  input: async () => {
    const key = nextKey('discard')
    await draftOf(key)
    return { kind: 'form', key }
  },
  fields: KIND_KEY,
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    forbidden: plainForbidden,
    invalid: kindAndKey,
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual(redirectsTo('/staff/settings/form'))
    expect(written).toEqual(['audit_log', 'config_versions'])
  },
})

describeActionCases(h, 'rollbackAction', {
  invoke: actions.rollbackAction,
  actor: () => h.actorFor('admin'),
  input: async () => {
    const key = nextKey('rollback')
    const admin = await h.actorFor('admin')
    await saveAndPublish(h.db, admin, 'form', key, JSON.parse(formBody(key, 'First')))
    await saveAndPublish(h.db, admin, 'form', key, JSON.parse(formBody(key, 'Second')))
    return { kind: 'form', key, toVersion: '1' }
  },
  fields: { ...KIND_KEY, toVersion: int({ required: true, min: 1, max: 1_000_000 }) },
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    forbidden: plainForbidden,
    invalid: kindAndKey,
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Rolled back to version 1 as version 3.' })
    expect(written).toEqual(['audit_log', 'config_versions'])
  },
})

describeActionCases(h, 'startDraftAction', {
  invoke: actions.startDraftAction,
  actor: () => h.actorFor('admin'),
  input: () => {
    const key = nextKey('fees')
    return { kind: 'fee_schedule', key, label: 'A new fee schedule' }
  },
  fields: { kind: choice({ required: true }), key: text({ max: 64 }), label: text({ max: 200 }) },
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    forbidden: formDraftForbidden,
    invalid: kindAndKey,
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { input, written }) => {
    expect(result).toEqual(redirectsTo(`/staff/settings/fee_schedule/${input.key}`))
    expect(written).toEqual(['audit_log', 'config_versions'])
  },
})

describe('startDraftAction refusals owned by a field', () => {
  it('refuses a name and short name that are both blank beside the Name field', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await actions.startDraftAction(
      h.form({ kind: 'fee_schedule', key: '', label: '  ' }),
    )
    expect(result).toEqual(refuseField('label', 'Enter a name.'))
  })
})

describeActionCases(h, 'adoptStarterAction', {
  invoke: starterActions.adoptStarterAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ starterId: NH_STARTERS[0]?.id }),
  fields: { starterId: text({ required: true, max: 100 }) },
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    forbidden: plainForbidden,
    invalid: (v: InvalidVariant) =>
      refuseField(
        'starterId',
        v.kind === 'too_long' ? 'Enter a starter of 100 characters or fewer.' : 'Enter a starter.',
      ),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toMatchObject({
      ok: true,
      message: expect.stringMatching(/^Adopted \d+ configuration items\.$/),
    })
    expect(written).toEqual(['audit_log', 'config_versions'])
  },
})

describe('applyStarterPathsAction', () => {
  it('says to select a change when nothing is ticked', async () => {
    h.signIn(await h.actorFor('admin'))
    const { value, written } = await h.recordWrites(() =>
      starterActions.applyStarterPathsAction(h.form({})),
    )
    expect({ value, written }).toEqual({
      value: { ok: false, error: 'Select at least one change to apply.' },
      written: [],
    })
  })

  it('refuses a staff member without config.edit once a change is ticked', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({ 'path:form:bp-form': '/label' })
    const { value, written } = await h.recordWrites(() =>
      starterActions.applyStarterPathsAction(form),
    )
    expect({ value, written }).toEqual({
      value: { ok: false, error: errorCopy('forbidden') },
      written: [],
    })
  })
})
