import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyMigrations } from '@/db/migrate'
import {
  applications,
  auditLog,
  boardDecisions,
  boards,
  clocks,
  cureNotices,
  decisionDeliveries,
  deemedRefusals,
  enforcementDesignations,
  hearings,
  inspections,
  noticeSets,
  parcelAliases,
  projects,
  rtkRequests,
  userRoles,
  users,
} from '@/db/schema'
import { getPublished } from '@/features/config/store'
import { varianceValidity } from '@/features/decisions/recording'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { FERNHOLLOW_STORIES, MAINE_TITLE_PREFIX } from '@/features/demo/me/maineStories'
import { seedDemo } from '@/features/demo/seedDemo'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { setActivePackForTest } from '@/features/packs/registry'
import { syncPackParcelIdFormats } from '@/features/parcels/syncPackFormats'
import { getTownSettings } from '@/features/town/settings'
import { makeEmptyDb, type TestDb } from '@/test/db'
import { demoSeedDeps, useDemoStoryClock } from '@/test/demoSeedDeps'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  useDemoStoryClock()
  setActivePackForTest(ME_PACK)
  handle = await makeEmptyDb()
  const migrated = await applyMigrations(handle.db, signal)
  if (!migrated.ok) throw new Error(migrated.error)
  await syncPackParcelIdFormats(handle.db, signal)
  await seedDemo(handle.db, signal, await demoSeedDeps())
}, 240_000)
afterAll(async () => {
  vi.useRealTimers()
  setActivePackForTest(null)
  await handle.drop()
})

async function story(title: string) {
  const [row] = await handle.db
    .select({ app: applications })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(projects.title, `${MAINE_TITLE_PREFIX} ${title}`))
  if (row === undefined) throw new Error(`missing story ${title}`)
  return row.app
}

async function clockOf(applicationId: string, ruleKey: string) {
  const [row] = await handle.db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, ruleKey)))
  return row
}

async function rolesOf(local: string) {
  return await handle.db
    .select({ role: userRoles.role, userId: users.id, kind: users.kind })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(users.email, `${local}@${DEMO_DOMAIN}`))
}

describe('the Fernhollow demo town', () => {
  it('is a Maine town with its building program, boards and parcels', async () => {
    const town = await getTownSettings(handle.db, signal)
    expect(town.ok && town.value).toMatchObject({
      name: 'Town of Fernhollow',
      stateCode: 'ME',
    })
    const program = await getPublished(handle.db, 'building_program', 'default', signal)
    expect(program?.body).toMatchObject({
      permitsEnabled: true,
      codeChoice: 'me.code.mubec',
      residents: 5200,
    })
    const profile = await getPublished(handle.db, 'town_profile', 'default', signal)
    expect((profile?.body as { addressLines: string[] }).addressLines.join(' ')).toContain(
      'Fernhollow',
    )
    const names = (await handle.db.select({ name: boards.name }).from(boards)).map((b) => b.name)
    expect(names.sort()).toEqual(['Fernhollow Board of Appeals', 'Fernhollow Planning Board'])
    const aliases = await handle.db
      .select({ value: parcelAliases.value })
      .from(parcelAliases)
      .where(eq(parcelAliases.format, 'map_lot'))
    expect(aliases.length).toBeGreaterThanOrEqual(20)
    for (const starter of ME_STARTERS) {
      const key = starter.applicationType.key
      expect(await getPublished(handle.db, 'application_type', key, signal), key).not.toBeNull()
    }
  })

  it('has the NH staff roles plus a plumbing inspector who is the code enforcement officer', async () => {
    for (const local of ['admin', 'staff', 'official', 'inspector', 'finance', 'records']) {
      expect((await rolesOf(local)).length, local).toBeGreaterThan(0)
    }
    const plumber = await rolesOf('plumbing')
    expect(plumber.map((r) => r.role).sort()).toEqual(['inspector', 'plumbing_inspector'])
    expect(plumber[0]?.kind).toBe('staff')
    const [designation] = await handle.db
      .select()
      .from(enforcementDesignations)
      .where(eq(enforcementDesignations.userId, plumber[0]?.userId ?? ''))
    expect(designation?.title).toContain('Code Enforcement Officer')
  })
})

describe('the Fernhollow stories', () => {
  it('keeps a building permit under review with its 30-day refusal date', async () => {
    const app = await story(FERNHOLLOW_STORIES.buildingUnderReview)
    expect(app.state).toBe('under_review')
    const clock = await clockOf(app.id, 'me.bp.decision')
    expect(clock?.status).toBe('running')
    expect(clock?.currentDue).toBe(addDays(app.receivedDate as CivilDate, 30))
  })

  it('refuses a building permit by operation of law', async () => {
    const app = await story(FERNHOLLOW_STORIES.buildingRefused)
    expect(app.state).toBe('denied')
    const [refusal] = await handle.db
      .select()
      .from(deemedRefusals)
      .where(eq(deemedRefusals.applicationId, app.id))
    expect(refusal?.ruleKey).toBe('me.bp.decision')
  })

  it('has an issued shoreland permit', async () => {
    expect((await story(FERNHOLLOW_STORIES.shorelandIssued)).state).toBe('issued')
  })

  it('has an internal plumbing permit issued by the plumbing inspector', async () => {
    const app = await story(FERNHOLLOW_STORIES.plumbingIssued)
    expect(app.state).toBe('issued')
    const [plumber] = await rolesOf('plumbing')
    const moves = await handle.db
      .select({ actor: auditLog.actorUserId, after: auditLog.after })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, app.id), eq(auditLog.action, 'application.transition')))
    const issued = moves.find((m) => JSON.stringify(m.after).includes('"issued"'))
    expect(issued?.actor).toBe(plumber?.userId)
  })

  it('has a subsurface wastewater permit with both inspections passed', async () => {
    const app = await story(FERNHOLLOW_STORIES.wastewater)
    const rows = await handle.db
      .select({ type: inspections.inspectionType, result: inspections.status })
      .from(inspections)
      .where(eq(inspections.applicationId, app.id))
    expect(rows.map((r) => `${r.type}:${r.result}`).sort()).toEqual([
      'before_covering:passed',
      'site_preparation:passed',
    ])
    expect(app.state).toBe('closed')
  })

  it('decides a subdivision with no hearing and its receipt notices proved', async () => {
    const app = await story(FERNHOLLOW_STORIES.subdivision)
    const [decision] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.applicationId, app.id))
    expect(decision?.outcome).toBe('approved')
    expect(decision?.hearingId).toBeNull()
    expect(
      await handle.db.select().from(hearings).where(eq(hearings.applicationId, app.id)),
    ).toEqual([])
    expect((await clockOf(app.id, 'me.pb.receipt_notice'))?.status).toBe('met')
    const sets = await handle.db
      .select({ id: noticeSets.id })
      .from(noticeSets)
      .where(eq(noticeSets.subjectId, app.id))
    expect(sets).toHaveLength(1)
    const status = await noticeStatus(handle.db, sets[0]?.id ?? '', signal)
    expect(status.items.length).toBeGreaterThan(0)
    expect(status.items.every((i) => i.state === 'proved_on_time')).toBe(true)
  })

  it('has a variance approved and waiting for recording', async () => {
    const app = await story(FERNHOLLOW_STORIES.variance)
    expect(await varianceValidity(handle.db, app.id, signal)).toBe('pending_recording')
    expect((await clockOf(app.id, 'me.boa.final_written_approval'))?.status).toBe('running')
    const delivered = await handle.db
      .select({ role: decisionDeliveries.recipientRole })
      .from(decisionDeliveries)
      .where(eq(decisionDeliveries.applicationId, app.id))
    expect(delivered.map((r) => r.role).sort()).toEqual([
      'agent',
      'applicant',
      'municipal_officers',
      'planning_board',
    ])
    expect((await clockOf(app.id, 'me.boa.delivery_due'))?.status).toBe('met')
  })

  it('has an administrative appeal before the Board of Appeals', async () => {
    const app = await story(FERNHOLLOW_STORIES.adminAppeal)
    expect(app.applicationTypeKey).toBe('AA')
    expect(['submitted', 'under_review']).toContain(app.state)
    const scheduled = await handle.db
      .select()
      .from(hearings)
      .where(eq(hearings.applicationId, app.id))
    expect(scheduled).toHaveLength(1)
  })

  it('has a shoreland case with a cure notice and one return receipt', async () => {
    const rows = await handle.db.select().from(cureNotices)
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.returnReceiptOn !== null)).toHaveLength(1)
  })

  it('has an acknowledged FOAA request', async () => {
    const rows = await handle.db.select().from(rtkRequests)
    expect(rows.map((r) => r.firstResponseKind)).toContain('acknowledged')
  })
})

describe('running the Maine seed again', () => {
  it('adds no second copy of the stories', async () => {
    const before = await handle.db.select({ id: projects.id }).from(projects)
    const report = await seedDemo(handle.db, signal, await demoSeedDeps())
    expect(report).toMatchObject({ usersCreated: 0, permitsSeeded: false })
    expect(await handle.db.select({ id: projects.id }).from(projects)).toHaveLength(before.length)
  })
})
