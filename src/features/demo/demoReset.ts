import path from 'node:path'
import { sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { applyMigrations } from '@/db/migrate'
import { isDevSignInEnabled } from '@/features/auth/devSignIn'
import { type SeedDemoDeps, type SeedReport, seedDemo } from '@/features/demo/seedDemo'
import { err, ok, type Result } from '@/types/result'

export function demoResetAllowed(): boolean {
  return isDevSignInEnabled() || env.CHIBAN_DEMO_MODE
}

export function demoSeedDirs(): Required<
  Pick<NonNullable<SeedDemoDeps['operations']>, 'exportDir' | 'legacySourceDir'>
> {
  const base = path.join(env.EXPORT_WORK_DIR, 'demo-seed')
  return {
    exportDir: path.join(base, 'exports'),
    legacySourceDir: path.join(base, 'legacy-source'),
  }
}

export async function resetDemoDatabase(
  db: Db,
  signal: AbortSignal,
  deps: SeedDemoDeps = {},
): Promise<Result<SeedReport, 'not_allowed' | 'migration_failed'>> {
  if (!demoResetAllowed()) return err('not_allowed')
  await db.execute(sql`drop schema if exists drizzle cascade`)
  await db.execute(sql`drop schema if exists public cascade`)
  await db.execute(sql`create schema public`)
  const migrated = await applyMigrations(db, signal)
  if (!migrated.ok) {
    console.error(`demo reset: migration failed: ${migrated.error}`)
    return err('migration_failed')
  }
  return ok(await seedDemo(db, signal, { screenStates: true, ...deps }))
}
