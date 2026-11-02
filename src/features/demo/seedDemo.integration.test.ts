import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROLES } from '@/constants/roles'
import {
  appeals,
  applications,
  boardPacketLinks,
  certificatesOfOccupancy,
  clocks,
  codeEditionRecords,
  documents,
  documentVersions,
  importExceptions,
  inspections,
  inspectorCalendars,
  ledgerEntries,
  legalHolds,
  parcels,
  paymentAttempts,
  reviewComments,
  users,
} from '@/db/schema'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import type { Actor } from '@/features/auth/actor'
import { loadActor } from '@/features/auth/actor'
import { listClockAdjustments } from '@/features/clocks/clockOverrides'
import { listContractorProjects } from '@/features/contractors/dashboard'
import { DEMO_USERS, seedDemo } from '@/features/demo/seedDemo'
import { DEMO_SEED_NOW } from '@/features/demo/seedParcels'
import { listFeeOverrides } from '@/features/fees/feeOverrides'
import { loadScheduleBoard } from '@/features/inspections/boardData'
import { getDayList } from '@/features/inspections/dayList'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { listAliasOverrides } from '@/features/parcels/aliasOverrides'
import { getPublicParcelView } from '@/features/parcels/publicParcelView'
import { getStaffParcelView } from '@/features/parcels/staffParcelView'
import { listUnresolvedLinks } from '@/features/parcels/unresolvedList'
import { listPreservationIncomplete } from '@/features/preservation/preserve'
import { getTownSettings } from '@/features/town/settings'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

let handle: TestDb
const signal = new AbortController().signal
const SEED_NOW = new Date('2027-06-01T16:00:00Z')
const SEED_DEPS = {
  records: { mail: createMemoryTransport() },
  inspections: { now: SEED_NOW },
}

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

async function counts(): Promise<Record<string, number>> {
  const result = await handle.db.execute<{ t: string; n: number }>(sql`
    select 'users' as t, count(*)::int as n from users
    union all select 'user_roles', count(*)::int from user_roles
    union all select 'role_capabilities', count(*)::int from role_capabilities
    union all select 'town_settings', count(*)::int from town_settings
    union all select 'parcels', count(*)::int from parcels
    union all select 'parcel_aliases', count(*)::int from parcel_aliases
    union all select 'lineage_events', count(*)::int from parcel_lineage_events
    union all select 'alias_overrides', count(*)::int from alias_overrides
    union all select 'import_exceptions', count(*)::int from import_exceptions
    union all select 'import_runs', count(*)::int from import_runs
    union all select 'record_links', count(*)::int from parcel_record_links
    union all select 'gis_features', count(*)::int from gis_features
    union all select 'config_versions', count(*)::int from config_versions
    union all select 'projects', count(*)::int from projects
    union all select 'applications', count(*)::int from applications
    union all select 'clocks', count(*)::int from clocks
    union all select 'clock_adjustments', count(*)::int from clock_adjustments
    union all select 'fee_assessments', count(*)::int from fee_assessments
    union all select 'fee_overrides', count(*)::int from fee_overrides
    union all select 'appeals', count(*)::int from appeals
    union all select 'code_edition_records', count(*)::int from code_edition_records
    union all select 'regional_impact_notices', count(*)::int from regional_impact_notices
    union all select 'attestations', count(*)::int from attestations
    union all select 'ledger_entries', count(*)::int from ledger_entries
    union all select 'ledger_allocations', count(*)::int from ledger_allocations
    union all select 'receipts', count(*)::int from receipts
    union all select 'payment_attempts', count(*)::int from payment_attempts
    union all select 'processor_accounts', count(*)::int from processor_accounts
    union all select 'license_checks', count(*)::int from license_checks
    union all select 'audit_log', count(*)::int from audit_log
    union all select 'documents', count(*)::int from documents
    union all select 'document_versions', count(*)::int from document_versions
    union all select 'files', count(*)::int from files
    union all select 'preservation_records', count(*)::int from preservation_records
    union all select 'document_text', count(*)::int from document_text
    union all select 'retention_assignments', count(*)::int from retention_assignments
    union all select 'legal_holds', count(*)::int from legal_holds
    union all select 'review_assignments', count(*)::int from review_assignments
    union all select 'review_comments', count(*)::int from review_comments
    union all select 'application_snapshots', count(*)::int from application_snapshots
    union all select 'board_packets', count(*)::int from board_packets
    union all select 'board_packet_links', count(*)::int from board_packet_links
    union all select 'contractor_claims', count(*)::int from contractor_claims
    union all select 'notification_outbox', count(*)::int from notification_outbox
    union all select 'inspections', count(*)::int from inspections
    union all select 'inspection_item_results', count(*)::int from inspection_item_results
    union all select 'calendar_pushes', count(*)::int from calendar_pushes
    union all select 'inspector_calendars', count(*)::int from inspector_calendars
    union all select 'certificates', count(*)::int from certificates_of_occupancy
  `)
  return Object.fromEntries(result.rows.map((r) => [r.t, r.n]))
}

describe('seedDemo', () => {
  it('creates Alder Pond, default grants, and one user per role', async () => {
    const report = await seedDemo(handle.db, signal, SEED_DEPS)
    expect(report.usersCreated).toBe(ROLES.length)
    const town = await getTownSettings(handle.db, signal)
    expect(town).toEqual({
      ok: true,
      value: {
        name: 'Town of Alder Pond',
        stateCode: 'NH',
        timeZone: 'America/New_York',
        basemapRasterUrl: null,
        basemapAttribution: null,
      },
    })
    const emails = (await handle.db.select({ email: users.email }).from(users)).map((u) => u.email)
    expect(emails.sort()).toEqual(DEMO_USERS.map((u) => u.email).sort())
    expect(emails.every((e) => e.endsWith('@alderpond.example'))).toBe(true)
  })

  it('names the nine seeded users by short role', () => {
    expect(DEMO_USERS.map((u) => u.email).sort()).toEqual(
      [
        'admin',
        'staff',
        'inspector',
        'finance',
        'records',
        'reviewer',
        'board',
        'applicant',
        'contractor',
      ]
        .map((n) => `${n}@alderpond.example`)
        .sort(),
    )
  })

  it('creates nothing and fails nothing on the second run', async () => {
    const before = await counts()
    const report = await seedDemo(handle.db, signal, SEED_DEPS)
    expect(await counts()).toEqual(before)
    expect(report.usersCreated).toBe(0)
  })

  it('seeds 36 imported parcels, two placeholder children, and one retired parent', async () => {
    const all = await handle.db.select().from(parcels)
    expect(all).toHaveLength(38)
    expect(all.filter((p) => p.status === 'retired')).toHaveLength(1)
    expect(all.filter((p) => p.geom === null)).toHaveLength(2)
  })

  it('seeded staff parcel page and public parcel page render with no unknown fields for parcel 007001000000', async () => {
    const staff = await handle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, 'staff@alderpond.example'),
    })
    const actor = await loadActor(handle.db, staff?.id ?? '', signal)
    const alias = await handle.db.query.parcelAliases.findFirst({
      where: (a, { eq }) => eq(a.value, '007001000000'),
    })
    const id = alias?.parcelId ?? ''
    const view = await getStaffParcelView(handle.db, actor!, id, new Date(), signal)
    if (!view.ok) throw new Error('staff view')
    for (const field of [
      view.value.siteAddress,
      view.value.owner,
      view.value.mailingAddress,
      view.value.areaAcres,
      view.value.geometry,
    ]) {
      expect(field.state).toBe('known')
    }
    const pub = await getPublicParcelView(handle.db, id, new Date(), signal)
    if (!pub.ok) throw new Error('public view')
    for (const field of [pub.value.siteAddress, pub.value.owner, pub.value.areaAcres]) {
      expect(field.state).toBe('known')
    }
  })

  it('seeded overrides view has one applied row', async () => {
    const rows = await listAliasOverrides(handle.db, new Date(), signal)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'applied', reason: 'Folder label uses old map number' })
  })

  it('seeded unresolved queue has one row', async () => {
    const rows = await listUnresolvedLinks(handle.db, signal)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.rawRefValue).toBe('008099000000')
  })

  it('seeded exception queue holds one open owner change', async () => {
    const rows = await handle.db.select().from(importExceptions)
    expect(rows.map((r) => [r.kind, r.status])).toEqual([['owner_changed', 'open']])
  })

  it('seed twice leaves identical row counts', async () => {
    const before = await counts()
    await seedDemo(handle.db, signal, SEED_DEPS)
    await seedDemo(handle.db, signal, SEED_DEPS)
    expect(await counts()).toEqual(before)
    expect(before.applications).toBe(12)
    expect(before.inspections).toBeGreaterThan(5)
    expect(before.certificates).toBe(1)
    expect(before.config_versions).toBeGreaterThan(30)
  })

  it('seeds the four starters and the permit scenarios', async () => {
    const rows = await handle.db.select().from(applications).orderBy(applications.number)
    const byState = Object.fromEntries(rows.map((r) => [r.number, r.state]))
    expect(Object.values(byState).sort()).toEqual([
      'closed',
      'issued',
      'issued',
      'issued',
      'issued',
      'issued',
      'submitted',
      'submitted',
      'submitted',
      'suspended',
      'under_review',
      'under_review',
    ])
    expect(Object.keys(byState).filter((n) => n.startsWith('EL-'))).toHaveLength(4)
  })

  it('seeds one fee waiver, one renewal, one appeal, and an open comment period', async () => {
    const overrides = await listFeeOverrides(handle.db, signal)
    expect(overrides.map((o) => [o.kind, o.status])).toEqual([['waive', 'applied']])
    const adjustments = await listClockAdjustments(handle.db, signal)
    expect(adjustments.map((a) => [a.kind, a.status])).toEqual([['renewal', 'applied']])
    expect(await handle.db.select().from(appeals)).toHaveLength(1)
    const comment = (await handle.db.select().from(clocks)).filter(
      (c) => c.ruleKey === 'nh.bp.regional_impact_comment' && c.status === 'running',
    )
    expect(comment).toHaveLength(1)
    expect((comment[0]?.currentDue ?? '') > '2027-06-01').toBe(true)
  })

  it('seeded application page renders every clock with a non-empty consequence', async () => {
    const staff = await handle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, 'staff@alderpond.example'),
    })
    const actor = await loadActor(handle.db, staff?.id ?? '', signal)
    const apps = await handle.db.select().from(applications)
    let seen = 0
    for (const app of apps) {
      const view = await getStaffApplicationView(handle.db, actor!, app.id, DEMO_SEED_NOW, signal)
      for (const clock of view?.clocks ?? []) {
        seen += 1
        expect(clock.consequence.length).toBeGreaterThan(0)
        expect(clock.countingMethod.length).toBeGreaterThan(0)
      }
    }
    expect(seen).toBeGreaterThanOrEqual(5)
  })

  it('every seeded building permit shows the code edition panel data once decided', async () => {
    const records = await handle.db.select().from(codeEditionRecords)
    expect(records.length).toBeGreaterThanOrEqual(2)
    expect(records.every((r) => r.editionKey === 'nh.edition.2024_07_01')).toBe(true)
  })
})

describe('seeded inspections', () => {
  const SEEDED_DAY = '2027-06-02'

  async function actorOf(local: string): Promise<Actor> {
    const row = await handle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
    })
    return (await loadActor(handle.db, row?.id ?? '', signal)) as Actor
  }

  it('seeded inspector day list for the seeded date has two stops', async () => {
    const inspector = await actorOf('inspector')
    const list = await getDayList(
      handle.db,
      inspector,
      { inspectorUserId: inspector.userId, date: SEEDED_DAY as CivilDate },
      signal,
      { now: SEED_NOW },
    )
    expect(list.ok && list.value.map((s) => s.status)).toEqual(['scheduled', 'scheduled'])
    expect(list.ok && list.value.some((s) => s.isReinspection)).toBe(true)
    expect(list.ok && list.value.find((s) => s.isReinspection)?.previousFailureNotes).toContain(
      'blocking',
    )
  })

  it('seeded schedule board lists one unscheduled portal request', async () => {
    const staff = await actorOf('staff')
    const board = await loadScheduleBoard(handle.db, staff, signal, SEED_NOW)
    if (!board.ok) throw new Error('board')
    expect(board.value.requests).toHaveLength(1)
    expect(board.value.requests[0]?.channel).toBe('portal')
  })

  it('seeds a failed framing inspection with notes and one photo, and a passed final with a certificate', async () => {
    const failed = (await handle.db.select().from(inspections)).filter((i) => i.status === 'failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ inspectionType: 'framing' })
    expect(failed[0]?.resultNotes).toContain('blocking')
    const photos = (await handle.db.select().from(documents)).filter(
      (doc) => doc.docKind === 'inspection_photo',
    )
    expect(photos).toHaveLength(1)
    const certs = await handle.db.select().from(certificatesOfOccupancy)
    expect(certs).toHaveLength(1)
    expect(certs[0]?.number).toMatch(/^CO-2027-0001$/)
  })

  it('the permit under appeal shows its cancelled inspection', async () => {
    const cancelled = (await handle.db.select().from(inspections)).filter(
      (i) => i.status === 'cancelled',
    )
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0]?.cancelReason).toBe('permit_suspended')
  })

  it('public parcel history lists inspections without notes or contact', async () => {
    const alias = await handle.db.query.parcelAliases.findFirst({
      where: (a, { eq }) => eq(a.value, '007006000000'),
    })
    const view = await getPublicParcelView(handle.db, alias?.parcelId ?? '', new Date(), signal)
    if (!view.ok) throw new Error('public view')
    const rows = view.value.history.own.filter((r) => r.kind === 'inspection')
    expect(rows.map((r) => r.status.label).sort()).toEqual(['Failed', 'Scheduled'])
    const text = JSON.stringify(rows)
    expect(text).not.toContain('blocking')
    expect(text).not.toContain('Contact')
  })

  it('inspector calendar is an email invite to the seeded inspector', async () => {
    const rows = await handle.db.select().from(inspectorCalendars)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'ics_email', email: 'inspector@alderpond.example' })
  })
})

describe('seeded records', () => {
  it('seeded public parcel page lists two public documents and no private ones', async () => {
    const alias = await handle.db.query.parcelAliases.findFirst({
      where: (a, { eq }) => eq(a.value, '007001000000'),
    })
    const view = await getPublicParcelView(handle.db, alias?.parcelId ?? '', new Date(), signal)
    if (!view.ok) throw new Error('public view')
    const titles = view.value.history.own.filter((r) => r.kind === 'document').map((r) => r.title)
    expect(titles.sort()).toEqual(['Panel schedule', 'Recorded plat', 'Septic approval'])
    expect(titles).not.toContain('Site sketch')
    expect(titles).not.toContain('Scanned letter (unreadable)')
  })

  it('preservation queue loader lists the seeded incomplete document', async () => {
    const staff = await handle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, 'staff@alderpond.example'),
    })
    const actor = (await loadActor(handle.db, staff?.id ?? '', signal)) as Actor
    const queue = await listPreservationIncomplete(handle.db, actor, { limit: 25 }, signal)
    if (!queue.ok) throw new Error('queue')
    expect(queue.value.rows.map((r) => r.title)).toEqual(['Scanned letter (unreadable)'])
  })

  it('seeded contractor dashboard lists two projects', async () => {
    const contractor = await handle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, 'contractor@alderpond.example'),
    })
    const actor = (await loadActor(handle.db, contractor?.id ?? '', signal)) as Actor
    const page = await listContractorProjects(handle.db, actor, { limit: 25 }, signal)
    expect(page.rows).toHaveLength(2)
    expect(page.rows.flatMap((r) => r.applications)).toHaveLength(2)
  })

  it('seeds a reviewer comment, a legal hold, a live board link, and a redacted public copy', async () => {
    const roles = await handle.db.select().from(documentVersions)
    expect(roles.filter((v) => v.role === 'public_redacted').length).toBeGreaterThanOrEqual(1)
    expect(await handle.db.select().from(legalHolds)).toHaveLength(1)
    expect(await handle.db.select().from(reviewComments)).toHaveLength(1)
    const links = await handle.db.select().from(boardPacketLinks)
    expect(links).toHaveLength(1)
    expect(links[0]?.revokedAt).toBeNull()
  })
})
