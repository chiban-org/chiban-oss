import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, enforcementDesignations } from '@/db/schema'
import {
  designateEnforcementOfficer,
  endEnforcementDesignation,
  updateEnforcementDesignation,
} from '@/features/enforcement/designations'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: EnforcementWorld
let designationId: string

const change = (fields: Record<string, string> = {}) => ({
  designationId,
  title: 'Building Inspector and Code Enforcement Officer',
  adoptingAuthority: 'Board of Selectmen',
  adoptedOn: '2026-03-02',
  ...fields,
})

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
  const made = await designateEnforcementOfficer(
    handle.db,
    world.admin,
    {
      userId: world.staff.userId,
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'Select Board',
      adoptedOn: '2026-03-01',
    },
    signal,
  )
  if (!made.ok) throw new Error(made.error)
  designationId = made.value.designationId
})
afterAll(async () => {
  await handle.drop()
})

describe('correcting an enforcement officer designation', () => {
  it('saves the title, authority and date and records what they were', async () => {
    expect(await updateEnforcementDesignation(handle.db, world.admin, change(), signal)).toEqual({
      ok: true,
      value: undefined,
    })
    const [row] = await handle.db
      .select()
      .from(enforcementDesignations)
      .where(eq(enforcementDesignations.id, designationId))
    expect(row).toMatchObject({
      title: 'Building Inspector and Code Enforcement Officer',
      adoptingAuthority: 'Board of Selectmen',
      adoptedOn: '2026-03-02',
    })
    const [entry] = await handle.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'enforcement.officer_designation_updated'),
          eq(auditLog.entityId, designationId),
        ),
      )
    expect(entry?.before).toEqual({
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'Select Board',
      adoptedOn: '2026-03-01',
    })
    expect(entry?.after).toMatchObject({ adoptingAuthority: 'Board of Selectmen' })
  })

  it('refuses staff without the settings capability', async () => {
    expect(await updateEnforcementDesignation(handle.db, world.staff, change(), signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('refuses a blank title and an adoption date after the designation ended', async () => {
    expect(
      await updateEnforcementDesignation(handle.db, world.admin, change({ title: ' ' }), signal),
    ).toEqual({ ok: false, error: 'invalid' })
    await endEnforcementDesignation(
      handle.db,
      world.admin,
      { designationId, endedOn: '2026-06-30' },
      signal,
    )
    expect(
      await updateEnforcementDesignation(
        handle.db,
        world.admin,
        change({ adoptedOn: '2026-07-01' }),
        signal,
      ),
    ).toEqual({ ok: false, error: 'invalid' })
  })
})
