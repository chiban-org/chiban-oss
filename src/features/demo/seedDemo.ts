import path from 'node:path'
import { sql } from 'drizzle-orm'
import type { Role } from '@/constants/roles'
import type { Db } from '@/db/client'
import { townSettings, userRoles, users } from '@/db/schema'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'

import { DEMO_DOMAIN } from '@/features/demo/domain'
import { seedAmendments } from '@/features/demo/seedAmendments'
import { seedBoards } from '@/features/demo/seedBoards'
import { withStoryCalendar } from '@/features/demo/seedCalendar'
import { seedCama } from '@/features/demo/seedCama'
import { seedCoverage } from '@/features/demo/seedCoverage'
import { seedCutover } from '@/features/demo/seedCutover'
import { seedEnforcement } from '@/features/demo/seedEnforcement'
import { seedBusinessExport, seedExportTarget } from '@/features/demo/seedExports'
import { seedAcknowledgedEmailTest, seedStaleJobAlert } from '@/features/demo/seedHealth'
import { seedHistorical } from '@/features/demo/seedHistorical'
import { type SeedInspectionsDeps, seedInspections } from '@/features/demo/seedInspections'
import { demoOcrConverter, seedMigration } from '@/features/demo/seedMigration'
import { seedNoticeContacts } from '@/features/demo/seedNoticeContacts'
import { seedBoardPacket } from '@/features/demo/seedPacket'
import { seedParcels } from '@/features/demo/seedParcels'
import { seedPayments } from '@/features/demo/seedPayments'
import { actorFor } from '@/features/demo/seedPermitSupport'
import { seedPermits } from '@/features/demo/seedPermits'
import { type SeedRecordsDeps, seedRecords } from '@/features/demo/seedRecords'
import { seedReportSchedules } from '@/features/demo/seedReportSchedules'
import { seedRecordsM10 } from '@/features/demo/seedRtk'
import { seedTownBoards } from '@/features/demo/seedTownBoards'
import { seedTownProfile } from '@/features/demo/seedTownProfile'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { getMailTransport } from '@/features/mail/transport'
import type { OcrConverter } from '@/features/migration/ocrmypdf'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'

export { DEMO_DOMAIN }

export interface DemoUser {
  email: string
  displayName: string
  roles: readonly Role[]
  kind: 'staff' | 'public'
}

export const DEMO_USERS: readonly DemoUser[] = [
  { email: `admin@${DEMO_DOMAIN}`, displayName: 'Avery Admin', roles: ['admin'], kind: 'staff' },
  { email: `staff@${DEMO_DOMAIN}`, displayName: 'Sam Clerk', roles: ['staff'], kind: 'staff' },
  {
    email: `official@${DEMO_DOMAIN}`,
    displayName: 'Dana Booth',
    roles: ['staff', 'inspector'],
    kind: 'staff',
  },
  {
    email: `inspector@${DEMO_DOMAIN}`,
    displayName: 'Ira Inspector',
    roles: ['inspector'],
    kind: 'staff',
  },
  {
    email: `finance@${DEMO_DOMAIN}`,
    displayName: 'Fern Finance',
    roles: ['finance'],
    kind: 'staff',
  },
  {
    email: `records@${DEMO_DOMAIN}`,
    displayName: 'Rae Records',
    roles: ['records_custodian'],
    kind: 'staff',
  },
  {
    email: `reviewer@${DEMO_DOMAIN}`,
    displayName: 'Remy Reviewer',
    roles: ['reviewer'],
    kind: 'staff',
  },
  {
    email: `board@${DEMO_DOMAIN}`,
    displayName: 'Bea Board',
    roles: ['board_member'],
    kind: 'staff',
  },
  { email: `fire@${DEMO_DOMAIN}`, displayName: 'Faye Fire', roles: ['reviewer'], kind: 'staff' },
  { email: `works@${DEMO_DOMAIN}`, displayName: 'Wes Works', roles: ['reviewer'], kind: 'staff' },
  {
    email: `pb.member@${DEMO_DOMAIN}`,
    displayName: 'Robin Vale',
    roles: ['board_member'],
    kind: 'public',
  },
  {
    email: `zba.member@${DEMO_DOMAIN}`,
    displayName: 'Drew Hale',
    roles: ['board_member'],
    kind: 'public',
  },
  {
    email: `concom.member@${DEMO_DOMAIN}`,
    displayName: 'Cleo Marsh',
    roles: ['board_member'],
    kind: 'public',
  },
  {
    email: `applicant@${DEMO_DOMAIN}`,
    displayName: 'Alex Applicant',
    roles: ['applicant'],
    kind: 'public',
  },
  {
    email: `contractor@${DEMO_DOMAIN}`,
    displayName: 'Cory Contractor',
    roles: ['contractor'],
    kind: 'public',
  },
]

export interface SeedOperationsDeps {
  store?: ObjectStore
  exportDir?: string
  legacySourceDir?: string
  converter?: OcrConverter
  mail?: ReturnType<typeof createMemoryTransport>
  now?: Date
}

export interface SeedDemoDeps {
  records?: SeedRecordsDeps
  inspections?: SeedInspectionsDeps
  operations?: SeedOperationsDeps
  boards?: { now?: Date }
  screenStates?: boolean
  now?: Date
}

const DEFAULT_EXPORT_DIR = './.data/exports'
const DEFAULT_LEGACY_DIR = './.data/legacy-source'

export interface SeedReport {
  townConfigured: boolean
  townProfileSeeded: boolean
  usersCreated: number
  rolesAssigned: number
  parcelsSeeded: boolean
  permitsSeeded: boolean
  paymentsSeeded: boolean
  recordsSeeded: boolean
  inspectionsSeeded: boolean
  operationsSeeded: boolean
  boardsSeeded: boolean
  enforcementSeeded: boolean
  coverageSeeded: boolean
}

export async function seedDemo(
  db: Db,
  signal: AbortSignal,
  deps: SeedDemoDeps = {},
): Promise<SeedReport> {
  signal.throwIfAborted()
  const base = await db.transaction(async (tx) => {
    const town = await tx
      .insert(townSettings)
      .values({ id: 1, name: 'Town of Alder Pond', stateCode: 'NH', timeZone: 'America/New_York' })
      .onConflictDoUpdate({
        target: townSettings.id,
        set: {
          name: 'Town of Alder Pond',
          stateCode: 'NH',
          timeZone: 'America/New_York',
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: townSettings.id })

    await seedDefaultGrants(tx, signal)

    const created = await tx
      .insert(users)
      .values(DEMO_USERS.map((u) => ({ email: u.email, displayName: u.displayName, kind: u.kind })))
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email })

    const idByEmail = new Map(created.map((u) => [u.email, u.id]))
    const roleRows = DEMO_USERS.flatMap((u) => {
      const userId = idByEmail.get(u.email)
      return userId === undefined ? [] : u.roles.map((role) => ({ userId, role }))
    })
    const assigned =
      roleRows.length === 0
        ? []
        : await tx.insert(userRoles).values(roleRows).onConflictDoNothing().returning()

    return {
      townConfigured: town.length === 1,
      usersCreated: created.length,
      rolesAssigned: assigned.length,
    }
  })
  const now = deps.now ?? new Date()
  const today = await townToday(db, now, signal)
  const seeded = await withStoryCalendar(today, () => seedStory(db, signal, deps, now))
  return { ...base, ...seeded }
}

type StoryReport = Omit<SeedReport, 'townConfigured' | 'usersCreated' | 'rolesAssigned'>

async function seedStory(
  db: Db,
  signal: AbortSignal,
  deps: SeedDemoDeps,
  now: Date,
): Promise<StoryReport> {
  const store = deps.operations?.store ?? getObjectStore()
  const townProfileSeeded = await seedTownProfile(db, store, signal)
  const seeded = await seedParcels(db, signal)
  const permitsSeeded = await seedPermits(db, signal)
  await seedAmendments(db, signal)
  const paymentsSeeded = await seedPayments(db, signal)
  const recordsSeeded = await seedRecords(db, signal, deps.records)
  const inspectionsSeeded = await seedInspections(db, signal, { now, ...deps.inspections })
  const boardStore = deps.operations?.store ?? deps.records?.store
  const boardNow = deps.boards?.now ?? now
  const boardsSeeded = await seedBoards(db, signal, boardNow, boardStore)
  await seedTownBoards(db, boardStore ?? getObjectStore(), signal, boardNow)
  await seedBoardPacket(db, signal, deps.records?.mail)
  await seedNoticeContacts(db, signal, boardNow)
  const operations = { now, ...deps.operations }
  const operationsSeeded = await seedOperations(db, signal, operations)
  const enforcementSeeded = await seedEnforcement(db, store, signal, operations.now)
  await seedRecordsM10(db, store, signal, operations.now)
  const mail = deps.records?.mail ?? getMailTransport()
  const coverageSeeded =
    deps.screenStates === true &&
    (await seedCoverage(db, { store, now: operations.now, mail }, signal))
  return {
    townProfileSeeded,
    parcelsSeeded: seeded.imported,
    permitsSeeded,
    paymentsSeeded,
    recordsSeeded,
    inspectionsSeeded,
    operationsSeeded,
    boardsSeeded,
    enforcementSeeded,
    coverageSeeded,
  }
}

async function seedOperations(
  db: Db,
  signal: AbortSignal,
  deps: SeedOperationsDeps,
): Promise<boolean> {
  const admin = await actorFor(db, 'admin', signal)
  const staff = await actorFor(db, 'staff', signal)
  const now = deps.now ?? new Date()
  const store = deps.store ?? getObjectStore()
  const steps = [
    await seedCama(db, admin, signal),
    await seedCutover(db, staff, signal),
    await seedHistorical(db, admin, signal),
    await seedMigration(
      db,
      store,
      deps.converter ?? demoOcrConverter,
      admin,
      path.resolve(deps.legacySourceDir ?? DEFAULT_LEGACY_DIR),
      signal,
    ),
    await seedStaleJobAlert(db, now, signal),
    await seedAcknowledgedEmailTest(db, deps.mail ?? createMemoryTransport(), now, signal),
    await seedExportTarget(db, admin, path.resolve(deps.exportDir ?? DEFAULT_EXPORT_DIR), signal),
    await seedBusinessExport(db, store, admin, signal),
    await seedReportSchedules(db, now, signal),
  ]
  return steps.some(Boolean)
}
