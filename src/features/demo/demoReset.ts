import path from 'node:path'
import { sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { applyMigrations } from '@/db/migrate'
import { isDevSignInEnabled } from '@/features/auth/devSignIn'
import { DemoOverlayError } from '@/features/demo/overlay/overlayIssue'
import { type SeedDemoDeps, type SeedReport, seedDemo } from '@/features/demo/seedDemo'
import { err, ok, type Result } from '@/types/result'

export type DemoResetError = 'not_allowed' | 'migration_failed' | { overlay: string }

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

async function freshSchema(db: Db, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  await db.execute(sql`drop schema if exists drizzle cascade`)
  await db.execute(sql`drop schema if exists public cascade`)
  await db.execute(sql`create schema public`)
  const migrated = await applyMigrations(db, signal)
  if (!migrated.ok) console.error(`demo reset: migration failed: ${migrated.error}`)
  return migrated.ok
}

const FELL_BACK = 'the plain demo was seeded instead'

function failureMessage(e: unknown): string {
  if (e instanceof DemoOverlayError) return `${e.message}; ${FELL_BACK}`
  const reason = e instanceof Error ? e.message : String(e)
  return `demo overlay: the demo seed failed with the overlay applied (${reason}); ${FELL_BACK}`
}

export async function resetDemoDatabase(
  db: Db,
  signal: AbortSignal,
  deps: SeedDemoDeps = {},
): Promise<Result<SeedReport, DemoResetError>> {
  if (!demoResetAllowed()) return err('not_allowed')
  if (!(await freshSchema(db, signal))) return err('migration_failed')
  const seedDeps = { screenStates: true, ...deps }
  if (deps.overlay === undefined) return ok(await seedDemo(db, signal, seedDeps))
  try {
    return ok(await seedDemo(db, signal, seedDeps))
  } catch (e) {
    if (signal.aborted) throw e
    const overlay = failureMessage(e)
    console.error(overlay)
    if (!(await freshSchema(db, signal))) return err('migration_failed')
    await seedDemo(db, signal, { ...seedDeps, overlay: undefined })
    return err({ overlay })
  }
}
