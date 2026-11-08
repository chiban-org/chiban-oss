import { eq } from 'drizzle-orm'
import { expect, vi } from 'vitest'
import { STAFF_ROLES } from '@/constants/roles'
import { accountProfiles, contractorProfiles, users } from '@/db/schema'
import { refuseField } from '@/server/formInput'
import { staffActor } from '@/test/parcels'
import {
  actionHarness,
  describeActionCases,
  type InvalidVariant,
  PORTAL_REFUSALS,
  phone,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { saveContractorAction, savePersonAction } = await import('./profileActions')

const h = actionHarness()

const NOUNS: Record<string, [string, number]> = {
  name: ['your name', 120],
  companyName: ['the company name', 200],
  mailingAddress: ['a mailing address', 300],
  license_electrical: ['the license number', 40],
}

function copyFor(variant: Pick<InvalidVariant, 'field' | 'kind'>, contact = false) {
  if (variant.field === 'phone') {
    return variant.kind === 'missing'
      ? 'Enter a phone number.'
      : 'Enter a phone number with 7 to 15 digits.'
  }
  const [noun, max] = NOUNS[variant.field] ?? ['', 0]
  const named = variant.field === 'name' && contact ? 'a contact name' : noun
  return variant.kind === 'too_long'
    ? `Enter ${named} of ${max} characters or fewer.`
    : `Enter ${named}.`
}

describeActionCases(h, 'savePersonAction', {
  invoke: savePersonAction,
  actor: () => staffActor(h.db, 'applicant'),
  input: () => ({ name: 'Morgan Reyes', phone: '603-555-0110', mailingAddress: '4 Pond Lane' }),
  fields: {
    name: text({ required: true, max: 120 }),
    phone: phone(),
    mailingAddress: text({ max: 300 }),
  },
  refusedRoles: STAFF_ROLES,
  refusals: { ...PORTAL_REFUSALS, invalid: (v) => refuseField(v.field, copyFor(v)) },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Your details are saved.' })
    expect(written).toEqual(expect.arrayContaining(['users', 'account_profiles', 'audit_log']))
    expect(written).not.toContain('contractor_profiles')
    const [row] = await db
      .select({ name: users.displayName, address: accountProfiles.mailingAddress })
      .from(users)
      .innerJoin(accountProfiles, eq(accountProfiles.userId, users.id))
      .where(eq(users.displayName, 'Morgan Reyes'))
    expect(row).toEqual({ name: 'Morgan Reyes', address: '4 Pond Lane' })
  },
})

describeActionCases(h, 'saveContractorAction', {
  invoke: saveContractorAction,
  actor: () => staffActor(h.db, 'applicant'),
  input: () => ({
    companyName: 'Builder and Sons',
    name: 'Pat Builder',
    phone: '603-555-0142',
    mailingAddress: '12 Mill Road',
    trades: 'electrical',
    license_electrical: 'EL-20418',
  }),
  fields: {
    companyName: text({ required: true, max: 200 }),
    name: text({ required: true, max: 120 }),
    phone: phone({ required: true }),
    mailingAddress: text({ max: 300 }),
    license_electrical: text({ max: 40 }),
  },
  refusedRoles: STAFF_ROLES,
  refusals: { ...PORTAL_REFUSALS, invalid: (v) => refuseField(v.field, copyFor(v, true)) },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Your contractor profile is set up.' })
    expect(written).toEqual(
      expect.arrayContaining([
        'contractor_profiles',
        'account_profiles',
        'user_roles',
        'audit_log',
      ]),
    )
    const [row] = await db
      .select({ trades: contractorProfiles.trades, licenses: contractorProfiles.licenses })
      .from(contractorProfiles)
      .where(eq(contractorProfiles.companyName, 'Builder and Sons'))
    expect(row).toEqual({
      trades: ['electrical'],
      licenses: [{ trade: 'electrical', number: 'EL-20418' }],
    })
  },
})
