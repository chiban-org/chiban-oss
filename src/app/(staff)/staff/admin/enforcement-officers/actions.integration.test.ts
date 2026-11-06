import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { auditLog, enforcementDesignations } from '@/db/schema'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  date,
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

const { updateDesignationAction } = await import('./actions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

async function heldDesignation(): Promise<string> {
  const officer = await h.actorFor('inspector')
  const [row] = await h.db
    .insert(enforcementDesignations)
    .values({
      userId: officer.userId,
      title: 'Building Inspector',
      adoptingAuthority: 'Planning Board',
      adoptedOn: '2026-05-04',
    })
    .returning({ id: enforcementDesignations.id })
  return row?.id ?? ''
}

describeActionCases(h, 'updateDesignationAction', {
  invoke: updateDesignationAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    designationId: await heldDesignation(),
    title: 'Code Enforcement Officer',
    adoptingAuthority: 'Select Board',
    adoptedOn: '2027-01-04',
  }),
  fields: {
    designationId: uuid({ required: true }),
    title: text({ required: true, max: 200 }),
    adoptingAuthority: text({ required: true, max: 200 }),
    adoptedOn: date({ required: true }),
  },
  capability: 'config.edit',
  refusals: STAFF_REFUSALS,
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Designation saved.' })
    expect(written).toEqual(['audit_log', 'enforcement_designations'])
    const id = input.designationId
    const [row] = await db
      .select()
      .from(enforcementDesignations)
      .where(eq(enforcementDesignations.id, id))
    expect(row).toMatchObject({
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-04',
      endedOn: null,
    })
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, id))
    expect(audits).toMatchObject([
      {
        action: 'enforcement.officer_designation_updated',
        before: {
          title: 'Building Inspector',
          adoptingAuthority: 'Planning Board',
          adoptedOn: '2026-05-04',
        },
        after: {
          title: 'Code Enforcement Officer',
          adoptingAuthority: 'Select Board',
          adoptedOn: '2027-01-04',
        },
      },
    ])
  },
})
