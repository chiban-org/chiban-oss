import { createReadStream } from 'node:fs'
import { parseArgs } from 'node:util'
import { db, pool } from '@/db/client'
import { importArchive } from '@/features/export/importArchive'
import { tarSource } from '@/features/export/readArchive'
import { getObjectStore } from '@/features/storage/objectStore'

const { values } = parseArgs({ options: { file: { type: 'string' } } })
if (values.file === undefined) {
  process.stderr.write('usage: import-archive --file <archive.tar>\n')
  process.exit(2)
}
const result = await importArchive(
  db,
  getObjectStore(),
  tarSource(createReadStream(values.file)),
  AbortSignal.timeout(6 * 60 * 60 * 1000),
)
await pool.end()
if (!result.ok) {
  process.stderr.write(`import refused: ${JSON.stringify(result.error)}\n`)
  process.exit(1)
}
process.stdout.write(`imported export ${result.value.exportId}: ${result.value.files} files\n`)
