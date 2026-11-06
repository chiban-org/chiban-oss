import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/constants/roles'
import { errorCopy } from '@/server/actionRunner'
import { seedParcelWorld } from '@/test/parcels'
import { actionHarness, describeActionCases, isPublicRole, text } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { templateSamplesAction, templatePreviewAction } = await import('./templateActions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

const fail = (code: string) => ({ ok: false as const, error: errorCopy(code) })
const forbidden = (role: Role) => fail(isPublicRole(role) ? 'signed_out' : 'forbidden')

describeActionCases(h, 'templateSamplesAction', {
  invoke: templateSamplesAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ templateKind: 'permit' }),
  fields: { templateKind: text({ required: true }) },
  capability: 'config.edit',
  refusals: {
    csrf: fail('csrf'),
    signedOut: fail('signed_out'),
    forbidden,
    invalid: { ok: false, error: 'Enter a kind of document.' },
    checkOnly: fail('check_unsupported'),
  },
  accepted: (result, { written }) => {
    expect(result).toMatchObject({ ok: true, samples: expect.any(Array) })
    expect(written).toEqual([])
  },
})

describe('template preview refusals', () => {
  it('refuses an unknown kind of document', async () => {
    h.signIn(await h.actorFor('admin'))
    expect(await templateSamplesAction(h.form({ templateKind: 'nonsense' }))).toEqual(
      fail('invalid_input'),
    )
  })

  it('refuses a preview whose body is not JSON', async () => {
    h.signIn(await h.actorFor('admin'))
    expect(await templatePreviewAction(h.form({ body: '{oops', recordId: 'x' }))).toEqual({
      ok: false,
      error: 'The settings could not be read. Reload the page and try again.',
    })
  })

  it('refuses a preview for someone without config.edit', async () => {
    h.signIn(await h.actorFor('staff'))
    expect(await templatePreviewAction(h.form({ body: '{}', recordId: 'x' }))).toEqual(
      fail('forbidden'),
    )
  })
})
