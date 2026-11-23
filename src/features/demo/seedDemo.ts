import path from 'node:path'
import type { Db } from '@/db/client'
import { type DemoUser, demoUsers, seedTownAndUsers } from '@/features/demo/demoUsers'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { seedMaineDemo } from '@/features/demo/me/seedMaineDemo'
import {
  applyOverlayAfterStory,
  applyOverlayBeforeStory,
  overlayTownName,
  type StarterOverlayReport,
} from '@/features/demo/overlay/applyOverlay'
import type { DemoOverlay } from '@/features/demo/overlay/overlaySchema'
import { seedAmendments } from '@/features/demo/seedAmendments'
import { seedBoards } from '@/features/demo/seedBoards'
import { withStoryCalendar } from '@/features/demo/seedCalendar'
import { seedCama } from '@/features/demo/seedCama'
import { seedCoverage } from '@/features/demo/seedCoverage'
import { seedCutover } from '@/features/demo/seedCutover'
import { runDailyJobsAsOf } from '@/features/demo/seedDailyJobs'
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
import { activePack } from '@/features/packs/registry'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'

export { DEMO_DOMAIN, type DemoUser, demoUsers }

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
  overlay?: DemoOverlay
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
  overlay: StarterOverlayReport | null
}

export async function seedDemo(
  db: Db,
  signal: AbortSignal,
  deps: SeedDemoDeps = {},
): Promise<SeedReport> {
  signal.throwIfAborted()
  if (activePack().manifest.id === 'me') return await seedMaineDemo(db, signal, deps)
  const name = overlayTownName(deps.overlay)
  const base = await seedTownAndUsers(db, { name, stateCode: 'NH', users: demoUsers() }, signal)
  const overlay =
    deps.overlay === undefined ? null : await applyOverlayBeforeStory(db, deps.overlay, signal)
  const now = deps.now ?? new Date()
  const today = await townToday(db, now, signal)
  const seeded = await withStoryCalendar(today, () => seedStory(db, signal, deps, now))
  await runDailyJobsAsOf(db, today, signal)
  if (deps.overlay !== undefined) await applyOverlayAfterStory(db, deps.overlay, signal)
  return { ...base, ...seeded, overlay }
}

type StoryReport = Omit<SeedReport, 'townConfigured' | 'usersCreated' | 'rolesAssigned' | 'overlay'>

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
