import { like } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { projects } from '@/db/schema'
import { seedMaineBoardSetup } from '@/features/demo/me/maineBoardSetup'
import {
  seedMaineAdminAppeal,
  seedMaineSubdivision,
  seedMaineVariance,
} from '@/features/demo/me/maineBoards'
import {
  designateMaineOfficer,
  seedMaineFoaa,
  seedMaineShorelandCase,
} from '@/features/demo/me/maineCases'
import { seedMaineConfig } from '@/features/demo/me/maineConfig'
import { day, maineContext } from '@/features/demo/me/maineContext'
import { seedMaineParcels } from '@/features/demo/me/maineParcels'
import { seedMaineBuildingPermits, seedMaineShoreland } from '@/features/demo/me/mainePermits'
import { seedMainePlumbing } from '@/features/demo/me/mainePlumbing'
import { MAINE_TITLE_PREFIX } from '@/features/demo/me/maineStories'
import { seedMaineBase } from '@/features/demo/me/maineTown'
import { runDailyJobsAsOf } from '@/features/demo/seedDailyJobs'
import type { SeedDemoDeps, SeedReport } from '@/features/demo/seedDemo'
import { getObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'

async function alreadySeeded(db: Db): Promise<boolean> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(like(projects.title, `${MAINE_TITLE_PREFIX}%`))
    .limit(1)
  return rows.length > 0
}

async function seedStories(db: Db, signal: AbortSignal, deps: SeedDemoDeps): Promise<void> {
  const now = deps.now ?? new Date()
  const today = await townToday(db, now, signal)
  const store = deps.operations?.store ?? deps.records?.store ?? getObjectStore()
  const ctx = await maineContext(db, { signal, store, now, today })
  await seedMaineConfig(db, ctx.cast.admin, day(ctx, -60), signal)
  await seedMaineParcels(db, ctx.cast.staff, signal)
  await designateMaineOfficer(ctx)
  await seedMaineBoardSetup(ctx)
  await seedMaineBuildingPermits(ctx)
  await seedMaineShoreland(ctx)
  await seedMainePlumbing(ctx)
  await seedMaineSubdivision(ctx)
  await seedMaineVariance(ctx)
  await seedMaineAdminAppeal(ctx)
  await seedMaineShorelandCase(ctx)
  await seedMaineFoaa(ctx)
  await runDailyJobsAsOf(db, today, signal)
}

export async function seedMaineDemo(
  db: Db,
  signal: AbortSignal,
  deps: SeedDemoDeps = {},
): Promise<SeedReport> {
  signal.throwIfAborted()
  const base = await seedMaineBase(db, signal)
  const seeded = !(await alreadySeeded(db))
  if (seeded) await seedStories(db, signal, deps)
  return {
    ...base,
    townProfileSeeded: seeded,
    parcelsSeeded: seeded,
    permitsSeeded: seeded,
    paymentsSeeded: false,
    recordsSeeded: seeded,
    inspectionsSeeded: seeded,
    operationsSeeded: false,
    boardsSeeded: seeded,
    enforcementSeeded: seeded,
    coverageSeeded: false,
    overlay: null,
  }
}
