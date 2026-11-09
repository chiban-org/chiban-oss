import { expect, it, vi } from 'vitest'
import { complaints } from '@/db/schema'
import { refuseField } from '@/server/formInput'
import type { FieldSpec } from '@/test/testHarness/actions'
import {
  actionHarness,
  describeActionCases,
  PORTAL_REFUSALS,
  text,
} from '@/test/testHarness/actions'
import { describeAnonymousCases } from '@/test/testHarness/actions/anonymousCases'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const { submitComplaintAction } = await import('./actions')

const h = actionHarness()
h.useObjectStore()

const email: FieldSpec = {
  required: false,
  variants: [{ kind: 'letters', label: 'as letters', value: 'not-an-email' }],
}

const COPY: Record<string, string> = {
  locationText: 'Enter where the property is.',
  description: 'Enter what you saw.',
  name: 'Enter your name of 200 characters or fewer.',
  email: 'Enter your email like name@example.com.',
  phone: 'Enter your phone with 7 to 15 digits.',
}

const TOO_LONG: Record<string, string> = {
  locationText: 'Enter where the property is of 300 characters or fewer.',
  description: 'Enter what you saw of 5000 characters or fewer.',
}

describeAnonymousCases(h, 'submitComplaintAction', {
  invoke: submitComplaintAction,
  input: () => ({
    locationText: '14 Birch Lane',
    description: 'A shed with no permit',
    name: 'Pat Neighbor',
    email: 'pat@example.test',
    phone: '603-555-0100',
  }),
  fields: {
    locationText: text({ required: true, max: 300 }),
    description: text({ required: true, max: 5000 }),
    name: text({ max: 200 }),
    email,
    phone: { required: false, variants: [{ kind: 'letters', label: 'as letters', value: 'abc' }] },
  },
  refusals: {
    csrf: PORTAL_REFUSALS.csrf,
    checkOnly: PORTAL_REFUSALS.checkOnly,
    invalid: (v) =>
      refuseField(
        v.field,
        (v.kind === 'too_long' ? TOO_LONG[v.field] : undefined) ?? COPY[v.field] ?? '',
      ),
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      redirectsTo: expect.stringMatching(
        /^\/complaints\/received\?ref=CP-\d{4}-\d{4,}&reply=contact$/,
      ),
    })
    const rows = await db
      .select({
        channel: complaints.channel,
        location: complaints.locationText,
        name: complaints.complainantName,
        email: complaints.complainantEmail,
        phone: complaints.complainantPhone,
      })
      .from(complaints)
    expect(rows).toEqual([
      {
        channel: 'public_named',
        location: '14 Birch Lane',
        name: 'Pat Neighbor',
        email: 'pat@example.test',
        phone: '603-555-0100',
      },
    ])
    expect(written).toContain('complaints')
  },
})

it('names both fields when location and description are whitespace only', async () => {
  h.signOut()
  const result = await submitComplaintAction(h.form({ locationText: '   ', description: '   ' }))
  expect(result).toEqual({
    ok: false,
    error: 'Enter where the property is. Enter what you saw.',
    fieldErrors: {
      locationText: 'Enter where the property is.',
      description: 'Enter what you saw.',
    },
  })
})
