import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { err, ok, type Result } from '@/types/result'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

const REQUIRED_EXTENSIONS = ['postgis', 'pgcrypto', 'citext'] as const

export async function applyMigrations(
  db: NodePgDatabase<Record<string, unknown>>,
  signal: AbortSignal,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<Result<{ applied: true }, string>> {
  try {
    signal.throwIfAborted()
    for (const extension of REQUIRED_EXTENSIONS) {
      await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS ${extension}`))
    }
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
