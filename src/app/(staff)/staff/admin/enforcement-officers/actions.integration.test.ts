import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { auditLog, enforcementDesignations } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, textMessage } from '@/test/boardCases'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  date,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { todayInTimeZone } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { designateOfficerAction, endDesignationAction, updateDesignationAction } = await import(
  './actions'
)

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

const TODAY = todayInTimeZone('America/New_York', new Date())

function adoptedMessage(variant: InvalidVariant): string {
  if (variant.kind === 'too_late' || variant.kind === 'too_early') {
    return `Enter the date adopted between January 1, 1900 and ${longDate(TODAY)}.`
  }
  return dateMessage('the date adopted', variant)
}

function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function refusalFor(variant: InvalidVariant) {
  switch (variant.field) {
    case 'userId':
      return refuseField('userId', 'Choose an officer.')
    case 'designationId':
      return refuseField('designationId', 'Choose a designation.')
    case 'title':
      return refuseField('title', textMessage('a title', 200, variant))
    case 'adoptingAuthority':
      return refuseField('adoptingAuthority', textMessage('who designated them', 200, variant))
    case 'endedOn':
      return refuseField('endedOn', dateMessage('the last day as officer', variant))
    default:
      return refuseField('adoptedOn', adoptedMessage(variant))
  }
}

async function heldDesignation(endedOn: string | null = null): Promise<string> {
  const officer = await h.actorFor('inspector')
  const [row] = await h.db
    .insert(enforcementDesignations)
    .values({
      userId: officer.userId,
      title: 'Building Inspector',
      adoptingAuthority: 'Planning Board',
      adoptedOn: '2026-05-04',
      endedOn,
    })
    .returning({ id: enforcementDesignations.id })
  return row?.id ?? ''
}

const designationFields = {
  title: text({ required: true, max: 200 }),
  adoptingAuthority: text({ required: true, max: 200 }),
  adoptedOn: date({ required: true, earliest: '1900-01-01', latest: TODAY }),
}

describeActionCases(h, 'designateOfficerAction', {
  invoke: designateOfficerAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    userId: (await h.actorFor('inspector')).userId,
    title: ' Code Enforcement Officer ',
    adoptingAuthority: 'Select Board',
    adoptedOn: '2026-05-04',
  }),
  fields: { userId: uuid({ required: true }), ...designationFields },
  capability: 'config.edit',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Officer designated.' })
    expect(written).toEqual(['audit_log', 'enforcement_designations'])
    const rows = await db
      .select({
        title: enforcementDesignations.title,
        adoptingAuthority: enforcementDesignations.adoptingAuthority,
        adoptedOn: enforcementDesignations.adoptedOn,
        endedOn: enforcementDesignations.endedOn,
      })
      .from(enforcementDesignations)
      .where(eq(enforcementDesignations.userId, String(input.userId)))
    expect(rows).toEqual([
      {
        title: 'Code Enforcement Officer',
        adoptingAuthority: 'Select Board',
        adoptedOn: '2026-05-04',
        endedOn: null,
      },
    ])
  },
})

describe('designateOfficerAction with the findings from the forms sweep', () => {
  it('refuses an adoption date in 2099 beside the Date adopted field and stores nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({
      userId: (await h.actorFor('inspector')).userId,
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'FS-A Board',
      adoptedOn: '2099-11-06',
    })
    const { value, written } = await h.recordWrites(() => designateOfficerAction(form))
    expect({ value, written }).toEqual({
      value: refuseField(
        'adoptedOn',
        `Enter the date adopted between January 1, 1900 and ${longDate(TODAY)}.`,
      ),
      written: [],
    })
  })

  it('names the authority field when it is 550 characters', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await designateOfficerAction(
      h.form({
        userId: (await h.actorFor('inspector')).userId,
        title: 'Code Enforcement Officer',
        adoptingAuthority: 'x'.repeat(550),
        adoptedOn: '2026-05-04',
      }),
    )
    expect(result).toEqual(
      refuseField('adoptingAuthority', 'Enter who designated them of 200 characters or fewer.'),
    )
  })
})

describeActionCases(h, 'updateDesignationAction', {
  invoke: updateDesignationAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    designationId: await heldDesignation(),
    title: 'Code Enforcement Officer',
    adoptingAuthority: 'Select Board',
    adoptedOn: '2026-06-04',
  }),
  fields: { designationId: uuid({ required: true }), ...designationFields },
  capability: 'config.edit',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Designation saved.' })
    expect(written).toEqual(['audit_log', 'enforcement_designations'])
    const id = String(input.designationId)
    const [row] = await db
      .select()
      .from(enforcementDesignations)
      .where(eq(enforcementDesignations.id, id))
    expect(row).toMatchObject({
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'Select Board',
      adoptedOn: '2026-06-04',
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
          adoptedOn: '2026-06-04',
        },
      },
    ])
  },
})

describeActionCases(h, 'endDesignationAction', {
  invoke: endDesignationAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ designationId: await heldDesignation(), endedOn: '2026-09-30' }),
  fields: {
    designationId: uuid({ required: true }),
    endedOn: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
  },
  capability: 'config.edit',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Designation ended.' })
    expect(written).toEqual(['audit_log', 'enforcement_designations'])
    const [row] = await db
      .select({ endedOn: enforcementDesignations.endedOn })
      .from(enforcementDesignations)
      .where(eq(enforcementDesignations.id, String(input.designationId)))
    expect(row?.endedOn).toBe('2026-09-30')
  },
})

describe('endDesignationAction with the findings from the forms sweep', () => {
  it('names the last day field when it falls before the adoption date', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ designationId: await heldDesignation(), endedOn: '2024-11-06' })
    const { value, written } = await h.recordWrites(() => endDesignationAction(form))
    expect({ value, written }).toEqual({
      value: refuseField(
        'endedOn',
        'The last day cannot be before the date the designation was adopted.',
      ),
      written: [],
    })
  })

  it('says so when the designation has already ended', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await endDesignationAction(
      h.form({ designationId: await heldDesignation('2026-08-01'), endedOn: '2026-09-30' }),
    )
    expect(result).toEqual({ ok: false, error: 'That designation has already ended.' })
  })
})
