import { eq } from 'drizzle-orm'
import { env } from '@/config/env'
import { db, pool } from '@/db/client'
import { users } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { loadBatchDetail } from '@/features/migration/batchQueries'
import { LEGACY_DOCS_USAGE, parseLegacyDocsArgs } from '@/features/migration/cliArgs'
import { createOcrmypdfConverter } from '@/features/migration/ocrmypdf'
import { runBatch } from '@/features/migration/runBatch'
import { scanSource } from '@/features/migration/scanSource'
import { getObjectStore } from '@/features/storage/objectStore'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const OCR_TIMEOUT_MS = 600_000

const parsed = parseLegacyDocsArgs(process.argv.slice(2))
if (!parsed.ok) {
  process.stderr.write(`${LEGACY_DOCS_USAGE}\n`)
  process.exit(2)
}
const args = parsed.value
const signal = AbortSignal.timeout(SIX_HOURS_MS)
const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, args.as))
const actor = user === undefined ? null : await loadActor(db, user.id, signal)
if (actor === null) {
  process.stderr.write('no active staff user with that email\n')
  process.exit(2)
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

let exitCode = 0
if (args.command === 'scan') {
  const scanned = await scanSource(db, actor, args.scan, signal)
  if (scanned.ok) print(scanned.value)
  else exitCode = 1
  if (!scanned.ok) process.stderr.write(`scan refused: ${scanned.error}\n`)
} else if (args.command === 'run') {
  const converter = createOcrmypdfConverter({
    path: env.OCRMYPDF_PATH,
    language: 'eng',
    timeoutMs: OCR_TIMEOUT_MS,
  })
  const ran = await runBatch(db, getObjectStore(), converter, actor, args.batchId, signal)
  if (ran.ok) print(ran.value)
  else exitCode = 1
  if (!ran.ok) process.stderr.write(`run refused: ${ran.error}\n`)
} else {
  const detail = await loadBatchDetail(db, actor, args.batchId, signal)
  if (detail.ok)
    print({
      status: detail.value.batch.status,
      report: detail.value.report,
      exceptions: detail.value.exceptions,
    })
  else exitCode = 1
  if (!detail.ok) process.stderr.write(`report refused: ${detail.error}\n`)
}
await pool.end()
process.exit(exitCode)
