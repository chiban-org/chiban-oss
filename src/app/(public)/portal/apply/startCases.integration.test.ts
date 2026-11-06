import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { applications } from '@/db/schema'
import { refuseField } from '@/server/formInput'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { staffActor } from '@/test/parcels'
import {
  actionHarness,
  describeActionCases,
  PORTAL_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { startApplicationAction } = await import('./actions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const COPY: Record<string, string> = {
  parcelId: 'Choose a parcel.',
  typeKey: 'Enter an application type.',
}

describeActionCases(h, 'startApplicationAction', {
  invoke: startApplicationAction,
  actor: () => staffActor(h.db, 'applicant'),
  input: () => ({ parcelId: world.parcelId, typeKey: 'BP' }),
  fields: { parcelId: uuid({ required: true }), typeKey: text({ required: true, max: 100 }) },
  refusedRoles: [],
  refusals: {
    ...PORTAL_REFUSALS,
    invalid: (v) =>
      refuseField(
        v.field,
        v.kind === 'too_long'
          ? 'Enter an application type of 100 characters or fewer.'
          : (COPY[v.field] ?? ''),
      ),
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      redirectsTo: expect.stringMatching(/^\/portal\/applications\/[0-9a-f-]{36}$/),
    })
    expect(written).toEqual(
      expect.arrayContaining(['applications', 'projects', 'project_parties', 'audit_log']),
    )
    const rows = await db
      .select({ state: applications.state, type: applications.applicationTypeKey })
      .from(applications)
      .where(eq(applications.applicationTypeKey, 'BP'))
    expect(rows).toEqual([{ state: 'draft', type: 'BP' }])
  },
})
