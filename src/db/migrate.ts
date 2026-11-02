import { fileURLToPath } from 'node:url'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { err, ok, type Result } from '@/types/result'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function applyMigrations(
  db: NodePgDatabase<Record<string, unknown>>,
  signal: AbortSignal,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<Result<{ applied: true }, string>> {
  try {
    signal.throwIfAborted()
    await migrate(db, { migrationsFolder })
    signal.throwIfAborted()
    return ok({ applied: true })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return err(e instanceof Error ? e.message : String(e))
  }
}

export async function runMigrationsCli(): Promise<void> {
  const { db, pool } = await import('./client')
  const result = await applyMigrations(db, AbortSignal.timeout(120_000))
  await pool.end()
  if (!result.ok) {
    console.error(`migration failed: ${result.error}`)
    process.exit(1)
  }
  console.warn('migrations applied')
  process.exit(0)
}
