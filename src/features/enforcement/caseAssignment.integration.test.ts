import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, enforcementCases, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { assigneeChoices, caseAssignee, reassignCase } from '@/features/enforcement/caseAssignment'
import { caseListFacets, listCasePage } from '@/features/enforcement/caseList'
import { openCase } from '@/features/enforcement/cases'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-02' as CivilDate
let handle: TestDb
let world: EnforcementWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
  await handle.db
    .update(users)
    .set({ displayName: 'Ira Inspector' })
    .where(eq(users.id, world.inspector.userId))
})
afterAll(async () => {
  await handle.drop()
})

async function newCase(): Promise<string> {
  const opened = await openCase(handle.db, world.staff, { locationText: '12 Heron Way' }, signal)
  if (!opened.ok) throw new Error('open failed')
  return opened.value.caseId
}

async function assignedTo(caseId: string) {
  const [row] = await handle.db
    .select({ id: enforcementCases.assignedTo })
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
  return row?.id ?? null
}

describe('reassigning an enforcement case', () => {
  it('hands the case to an inspector, records it, and shows the new assignee on the list', async () => {
    const caseId = await newCase()
    const result = await reassignCase(
      handle.db,
      world.staff,
      { caseId, userId: world.inspector.userId },
      signal,
    )
    expect(result.ok).toBe(true)
    expect(await assignedTo(caseId)).toBe(world.inspector.userId)
    expect((await caseAssignee(handle.db, caseId))?.name).toBe('Ira Inspector')
    const page = await listCasePage(
      handle.db,
      world.staff,
      { filters: {}, limit: 25, offset: 0 },
      TODAY,
      signal,
    )
    expect(page.rows.find((r) => r.caseId === caseId)?.assignedToName).toBe('Ira Inspector')
    const mine = await caseListFacets(handle.db, world.inspector, { filters: {} }, TODAY, signal)
    expect(mine.assigned.get('me')).toBe(1)
    const audits = await handle.db
      .select({ before: auditLog.before, after: auditLog.after })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, caseId), eq(auditLog.action, 'enforcement.case_assigned')))
    expect(audits).toEqual([
      { before: { assignedTo: world.staff.userId }, after: { assignedTo: world.inspector.userId } },
    ])
  })

  it('leaves a case unassigned when asked, and counts it under Unassigned', async () => {
    const caseId = await newCase()
    const result = await reassignCase(handle.db, world.staff, { caseId, userId: null }, signal)
    expect(result.ok).toBe(true)
    expect(await assignedTo(caseId)).toBeNull()
    const page = await listCasePage(
      handle.db,
      world.staff,
      { filters: { assigned: ['none'] }, limit: 25, offset: 0 },
      TODAY,
      signal,
    )
    expect(page.rows.map((r) => r.caseId)).toEqual([caseId])
    expect(page.rows[0]?.assignedToName).toBeNull()
  })

  it('refuses an assignee who cannot work enforcement cases', async () => {
    const caseId = await newCase()
    const result = await reassignCase(
      handle.db,
      world.staff,
      { caseId, userId: world.finance.userId },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_eligible' })
    expect(await assignedTo(caseId)).toBe(world.staff.userId)
  })

  it('refuses someone without enforcement.manage', async () => {
    const caseId = await newCase()
    const result = await reassignCase(
      handle.db,
      world.finance,
      { caseId, userId: world.inspector.userId },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(await assignedTo(caseId)).toBe(world.staff.userId)
  })

  it('offers the people whose role works enforcement cases', async () => {
    const ids = (await assigneeChoices(handle.db)).map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([world.staff.userId, world.inspector.userId]))
    expect(ids).not.toContain(world.finance.userId)
  })
})
