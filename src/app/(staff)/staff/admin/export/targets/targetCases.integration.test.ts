import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { exportTargets } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  describeActionCases,
  int,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { saveTargetAction, setTargetActiveAction, runTargetNowAction } = await import('./actions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

const ROOT = join(tmpdir(), 'chiban-target-cases')

async function activeTarget(isActive = true): Promise<string> {
  const [row] = await h.db
    .insert(exportTargets)
    .values({
      kind: 'local_fs',
      name: 'Town server',
      dayOfMonth: 3,
      settings: { root: ROOT },
      isActive,
    })
    .returning({ id: exportTargets.id })
  return row?.id ?? ''
}

function invalidSave(variant: { field: string; kind: string }) {
  if (variant.field === 'name') {
    return refuseField(
      'name',
      variant.kind === 'too_long' ? 'Enter a name of 120 characters or fewer.' : 'Enter a name.',
    )
  }
  return refuseField(
    'dayOfMonth',
    variant.kind === 'missing'
      ? 'Enter the day of the month.'
      : 'Enter the day of the month as a whole number from 1 to 28.',
  )
}

describeActionCases(h, 'saveTargetAction', {
  invoke: saveTargetAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ kind: 'local_fs', name: ' Town server ', dayOfMonth: '3', root: ROOT }),
  fields: {
    name: text({ required: true, max: 120 }),
    dayOfMonth: int({ required: true, min: 1, max: 28 }),
  },
  capability: 'config.edit',
  refusals: { ...STAFF_REFUSALS, invalid: invalidSave, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Saved. Reload this page to see it in the list.' })
    expect(written).toEqual(['audit_log', 'export_targets'])
    const rows = await db
      .select({ name: exportTargets.name, dayOfMonth: exportTargets.dayOfMonth })
      .from(exportTargets)
      .where(eq(exportTargets.name, 'Town server'))
    expect(rows).toContainEqual({ name: 'Town server', dayOfMonth: 3 })
  },
})

describe('saveTargetAction with the findings from the forms sweep', () => {
  const base = { kind: 'local_fs', name: 'Town server', dayOfMonth: '3', root: ROOT }

  async function save(fields: Record<string, string>) {
    h.signIn(await h.actorFor('admin'))
    return await h.recordWrites(() => saveTargetAction(h.form({ ...base, ...fields })))
  }

  it('names the name field for a whitespace-only name', async () => {
    const { value, written } = await save({ name: '   ' })
    expect({ value, written }).toEqual({ value: refuseField('name', 'Enter a name.'), written: [] })
  })

  it.each(['0', '29'])('names the day field for day %s', async (day) => {
    const { value } = await save({ dayOfMonth: day })
    expect(value).toEqual(
      refuseField('dayOfMonth', 'Enter the day of the month as a whole number from 1 to 28.'),
    )
  })

  it('names the folder field for a relative path', async () => {
    const { value } = await save({ root: 'backups/chiban' })
    expect(value).toEqual(
      refuseField('root', 'Enter the full path of the folder, starting with /.'),
    )
  })

  it('names the folder field for a path that is not a folder', async () => {
    const { value } = await save({ root: '/dev/null/chiban' })
    expect(value).toEqual(
      refuseField(
        'root',
        'That folder cannot be written to. Choose an existing folder the Chiban service can write to.',
      ),
    )
  })

  it('names the access key field for an s3 target without credentials', async () => {
    const { value } = await save({
      kind: 's3',
      endpoint: 'https://s3.example.org',
      bucket: 'town',
      region: 'us-east-1',
    })
    expect(value).toEqual({
      ok: false,
      error: 'Enter the access key ID. Enter the secret access key.',
      fieldErrors: {
        accessKeyId: 'Enter the access key ID.',
        secretAccessKey: 'Enter the secret access key.',
      },
    })
  })

  it('names the tenant field for a malformed Microsoft tenant', async () => {
    const { value } = await save({
      kind: 'onedrive',
      tenantId: 'not a tenant',
      clientId: 'c',
      driveId: 'd',
      clientSecret: 's',
    })
    expect(value).toMatchObject({ ok: false, fieldErrors: { tenantId: expect.any(String) } })
  })
})

const ID_REFUSAL = refuseField('id', 'Choose a target.')

describeActionCases(h, 'setTargetActiveAction', {
  invoke: setTargetActiveAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ id: await activeTarget(), active: 'false' }),
  fields: { id: uuid({ required: true }) },
  capability: 'config.edit',
  refusals: { ...STAFF_REFUSALS, invalid: ID_REFUSAL, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Turned off.' })
    expect(written).toEqual(['audit_log', 'export_targets'])
    const [row] = await db
      .select({ isActive: exportTargets.isActive })
      .from(exportTargets)
      .where(eq(exportTargets.id, String(input.id)))
    expect(row?.isActive).toBe(false)
  },
})

describeActionCases(h, 'runTargetNowAction', {
  invoke: runTargetNowAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ id: await activeTarget() }),
  fields: { id: uuid({ required: true }) },
  capability: 'config.edit',
  refusals: { ...STAFF_REFUSALS, invalid: ID_REFUSAL, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Requested. The copy starts within a minute or two.',
    })
    expect(written).toEqual(['export_targets'])
    const [row] = await db
      .select({ at: exportTargets.runRequestedAt })
      .from(exportTargets)
      .where(eq(exportTargets.id, String(input.id)))
    expect(row?.at).not.toBeNull()
  },
})
