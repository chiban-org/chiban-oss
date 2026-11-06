import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { applications } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { attestationHash } from '@/features/applications/submitApplication'
import { createProject } from '@/features/projects/projects'
import { refuseField } from '@/server/formInput'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeParcel, staffActor } from '@/test/parcels'
import {
  actionHarness,
  choice,
  describeActionCases,
  PORTAL_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { describeForeignRecordCase } from '@/test/testHarness/actions/foreignRecord'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const { saveDraftAction, submitApplicationAction } = await import('./actions')

const h = actionHarness()
h.useObjectStore()

const signal = new AbortController().signal
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db, { starters: ['nh.starter.alarm_registration'] })
})

const NOT_FOUND = { ok: false as const, error: 'That record was not found.' }
const APPLICATION_REFUSED = refuseField('applicationId', 'Choose an application.')
const NOT_PARTY_ROLES = ['reviewer', 'board_member', 'applicant', 'contractor'] as const

async function draft(): Promise<string> {
  return (await makeApplication(h.db, world, {}, undefined, 'AR')).applicationId
}

async function attestationFor(applicationId: string): Promise<string> {
  const context = await loadApplicationContext(h.db, applicationId, signal)
  return attestationHash(context?.typeBody.attestationText ?? '')
}

async function strangerOnOwnRecord() {
  const stranger = await staffActor(h.db, 'applicant')
  const parcelId = await makeParcel(h.db, [])
  const project = await createProject(h.db, stranger, { parcelId, title: 'Shed' }, signal)
  if (!project.ok) throw new Error('project failed')
  return stranger
}

describeActionCases(h, 'saveDraftAction', {
  invoke: saveDraftAction,
  actor: () => world.applicant,
  input: async () => ({
    applicationId: await draft(),
    emergency_contact: 'Pat Rivera 603-555-0100',
  }),
  fields: { applicationId: uuid({ required: true }) },
  refusedRoles: NOT_PARTY_ROLES,
  refusals: {
    ...PORTAL_REFUSALS,
    forbidden: NOT_FOUND,
    invalid: APPLICATION_REFUSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Draft saved.' })
    expect(written).toEqual(['applications'])
    const [row] = await db
      .select({ values: applications.values, state: applications.state })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
    expect(row).toEqual({
      state: 'draft',
      values: { emergency_contact: 'Pat Rivera 603-555-0100' },
    })
  },
})

describeForeignRecordCase(h, 'saveDraftAction on another applicant record', {
  invoke: saveDraftAction,
  actor: strangerOnOwnRecord,
  input: async () => ({ applicationId: await draft(), emergency_contact: 'Mallory' }),
  refusal: NOT_FOUND,
})

function requiredRefused(field: string) {
  return {
    ok: false as const,
    error: 'Check the highlighted fields and try again.',
    fieldErrors: { [field]: 'This is required.' },
  }
}

const SUBMIT_FIELD_COPY: Record<string, ReturnType<typeof refuseField>> = {
  applicationId: APPLICATION_REFUSED,
  attest: refuseField('attest', 'Check the box to confirm the information is true.'),
  emergency_contact: requiredRefused('emergency_contact'),
  description: requiredRefused('description'),
}

async function submitInput() {
  const applicationId = await draft()
  return {
    applicationId,
    emergency_contact: 'Pat Rivera 603-555-0100',
    description: 'Alarm panel at the front door',
    attest: 'true',
    attestationSha256: await attestationFor(applicationId),
  }
}

describeActionCases(h, 'submitApplicationAction', {
  invoke: submitApplicationAction,
  actor: () => world.applicant,
  input: submitInput,
  fields: {
    applicationId: uuid({ required: true }),
    attest: choice({ required: true }),
    emergency_contact: text({ required: true }),
    description: text({ required: true }),
  },
  refusedRoles: NOT_PARTY_ROLES,
  refusals: {
    ...PORTAL_REFUSALS,
    invalid: (v) => SUBMIT_FIELD_COPY[v.field] ?? PORTAL_REFUSALS.invalid,
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Application submitted.' })
    const [row] = await db
      .select({ state: applications.state, values: applications.values })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
    expect(row).toEqual({
      state: 'submitted',
      values: {
        emergency_contact: 'Pat Rivera 603-555-0100',
        description: 'Alarm panel at the front door',
      },
    })
  },
})

describeForeignRecordCase(h, 'submitApplicationAction on another applicant record', {
  invoke: submitApplicationAction,
  actor: strangerOnOwnRecord,
  input: submitInput,
  refusal: { ok: false, error: 'You do not have permission to do this.' },
})
