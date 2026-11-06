import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/constants/roles'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'
import { errorCopy } from '@/server/actionRunner'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { pngBytes } from '@/test/frameFixtures'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  describeActionCases,
  isPublicRole,
  STAFF_REFUSALS,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const { publishTownSectionAction, uploadTownImageAction } = await import('./actions')

const h = actionHarness()
h.useObjectStore()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

const PROFILE = { ...TOWN_PROFILE_SKELETON, officeName: 'Land Use Office' }

const forbidden = (role: Role) => ({
  ok: false as const,
  error: errorCopy(isPublicRole(role) ? 'signed_out' : 'forbidden'),
})

describeActionCases(h, 'publishTownSectionAction', {
  invoke: publishTownSectionAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ section: 'profile', body: JSON.stringify(PROFILE) }),
  fields: { section: text({ required: true, max: 50 }) },
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    forbidden,
    invalid: (v) =>
      refuseField(
        'section',
        v.kind === 'too_long' ? 'Enter a section of 50 characters or fewer.' : 'Enter a section.',
      ),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Published version 1.' })
    expect(written).toEqual(['audit_log', 'config_versions'])
  },
})

describe('publishTownSectionAction refusals beside their fields', () => {
  it('refuses an unknown section beside the section field', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await publishTownSectionAction(
      h.form({ section: 'nonsense', body: JSON.stringify(PROFILE) }),
    )
    expect(result).toEqual(refuseField('section', 'Choose a section.'))
  })

  it('refuses a body that is not JSON', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await publishTownSectionAction(h.form({ section: 'profile', body: '{oops' }))
    expect(result).toEqual(
      refuseField('body', 'The settings could not be read. Reload the page and try again.'),
    )
  })

  it('words a bad email without schema text', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await publishTownSectionAction(
      h.form({ section: 'profile', body: JSON.stringify({ ...PROFILE, email: 'clerk-at-town' }) }),
    )
    expect(result).toEqual({
      ok: false,
      error: 'These settings cannot be published yet.',
      fieldErrors: { email: 'Enter an email address like clerk@town.gov.' },
    })
  })
})

describeActionCases(h, 'uploadTownImageAction', {
  invoke: uploadTownImageAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    file: new File([new Uint8Array(await pngBytes(8, 8))], 'seal.png', { type: 'image/png' }),
  }),
  fields: {},
  capability: 'config.edit',
  refusals: {
    csrf: { ok: false, error: errorCopy('csrf') },
    signedOut: { ok: false, error: errorCopy('signed_out') },
    forbidden,
    invalid: { ok: false, error: 'Choose an image to upload.' },
    checkOnly: { ok: false, error: errorCopy('check_unsupported') },
  },
  accepted: (result) => {
    expect(result).toMatchObject({
      ok: true,
      image: { contentType: 'image/png', width: 8, height: 8 },
    })
  },
})
