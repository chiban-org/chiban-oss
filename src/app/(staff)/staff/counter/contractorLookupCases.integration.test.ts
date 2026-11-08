import { beforeAll, expect, vi } from 'vitest'
import type { ContractorLookupResult } from '@/components/counter/counterTypes'
import { ROLES } from '@/constants/roles'
import { loadActor } from '@/features/auth/actor'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import { saveContractorProfile } from '@/features/contractors/profile'
import { makeUser } from '@/test/factories'
import { plainRefusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  describeActionCases,
  STAFF_REFUSALS,
  text,
} from '@/test/testHarness/actions'
import type { Refusals } from '@/test/testHarness/actions/cases'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { lookupContractorAction } = await import('./contractorLookupAction')

const h = actionHarness()
const EMAIL = 'pat@builder.example'
const signal = new AbortController().signal

const COUNTER_ROLES = ROLES.filter((role) => {
  const grants = new Map(Object.entries(DEFAULT_GRANTS)).get(role) ?? []
  return grants.includes('permit.issue') && grants.includes('payment.collect')
})

beforeAll(async () => {
  const id = await makeUser(h.db, { role: 'applicant', email: EMAIL })
  const actor = await loadActor(h.db, id, signal)
  if (actor === null) throw new Error('actor')
  await saveContractorProfile(
    h.db,
    actor,
    {
      name: 'Pat Builder',
      phone: '603-555-0142',
      mailingAddress: null,
      companyName: 'Builder and Sons',
      trades: ['electrical'],
      licenses: [{ trade: 'electrical', number: 'EL-20418' }],
    },
    signal,
  )
})

describeActionCases(h, 'lookupContractorAction', {
  invoke: lookupContractorAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ contractorEmail: EMAIL, typeKey: 'EL' }),
  fields: {
    contractorEmail: text({ required: true }),
    typeKey: text({ required: true, max: 100 }),
  },
  refusedRoles: ROLES.filter((role) => !COUNTER_ROLES.includes(role)),
  refusals: {
    ...(STAFF_REFUSALS as unknown as Refusals<ContractorLookupResult>),
    invalid: plainRefusalFor({
      contractorEmail: 'Enter the contractor email.',
      typeKey: {
        whitespace: 'Enter a permit type.',
        missing: 'Enter a permit type.',
        too_long: 'Enter a permit type of 100 characters or fewer.',
      },
    }),
  },
  accepted: (result, { written }) => {
    expect(written).toEqual([])
    expect(result).toEqual({
      ok: true,
      account: {
        companyName: 'Builder and Sons',
        contactName: 'Pat Builder',
        licenses: [{ trade: 'electrical', label: 'Electrical', number: 'EL-20418' }],
        prefillLicenseNumber: 'EL-20418',
      },
    })
  },
})
