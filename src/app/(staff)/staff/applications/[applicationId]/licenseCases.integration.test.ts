import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { licenseChecks } from '@/db/schema'
import { CHECK_PASSED } from '@/server/formInput'
import type { PermitWorld } from '@/test/applicationFixtures'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { recordLicenseCheckAction } = await import('./licenseActions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
})

async function uncheckedTrade(): Promise<string> {
  const trade = await submittedTrade(h.db, world)
  await h.db.delete(licenseChecks).where(eq(licenseChecks.applicationId, trade.applicationId))
  return trade.applicationId
}

describeActionCases(h, 'recordLicenseCheckAction', {
  invoke: recordLicenseCheckAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await uncheckedTrade(),
    licenseNumber: 'EL-20418',
    licenseType: 'Master electrician',
    result: 'active',
    note: '',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    licenseNumber: text({ required: true, max: 100 }),
    licenseType: text({ required: true, max: 100 }),
    result: choice({ required: true }),
    note: text({ max: 500 }),
  },
  capability: 'permit.issue',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      licenseNumber: {
        missing: 'Enter the license number.',
        whitespace: 'Enter the license number.',
        otherwise: 'Enter the license number of 100 characters or fewer.',
      },
      licenseType: {
        missing: 'Enter the license type.',
        whitespace: 'Enter the license type.',
        otherwise: 'Enter the license type of 100 characters or fewer.',
      },
      result: 'Choose the result of the state lookup.',
      note: 'Enter the note of 500 characters or fewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'License check recorded. The license is active.',
    })
    expect(written).toEqual(['audit_log', 'license_checks'])
  },
})

describe('a failing license check', () => {
  it('says issuance stays blocked', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({
      applicationId: await uncheckedTrade(),
      licenseNumber: 'EL-20418',
      licenseType: 'Master electrician',
      result: 'expired',
      note: 'Lapsed in June',
    })
    expect(await recordLicenseCheckAction(form)).toEqual({
      ok: true,
      message:
        'License check recorded. The permit cannot be issued until a check finds the license active.',
    })
  })
})
