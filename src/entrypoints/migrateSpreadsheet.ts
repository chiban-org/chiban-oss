import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { eq } from 'drizzle-orm'
import { db, pool } from '@/db/client'
import { users } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { importSheet } from '../../scripts/migrations/spreadsheet/importSheet'
import { spreadsheetMappingSchema } from '../../scripts/migrations/spreadsheet/mapping'

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    mapping: { type: 'string' },
    as: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
})
if (values.file === undefined || values.mapping === undefined || values.as === undefined) {
  process.stderr.write(
    'usage: migrate-spreadsheet --file <sheet.xlsx|sheet.csv> --mapping <mapping.json> --as <staff email> [--dry-run]\n',
  )
  process.exit(2)
}
const signal = AbortSignal.timeout(6 * 60 * 60 * 1000)

let mappingJson: unknown
try {
  mappingJson = JSON.parse(await readFile(values.mapping, { encoding: 'utf8', signal }))
} catch {
  process.stderr.write('the mapping file is not readable JSON\n')
  process.exit(2)
}
const mapping = spreadsheetMappingSchema.safeParse(mappingJson)
if (!mapping.success) {
  process.stderr.write(
    `the mapping is invalid: ${mapping.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}\n`,
  )
  process.exit(2)
}

const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, values.as))
const actor = user === undefined ? null : await loadActor(db, user.id, signal)
if (actor === null) {
  process.stderr.write('no active staff user with that email\n')
  process.exit(2)
}
const result = await importSheet(
  db,
  actor,
  { path: values.file, mapping: mapping.data, dryRun: values['dry-run'] === true },
  signal,
)
await pool.end()
if (!result.ok) {
  const reason =
    typeof result.error === 'string' ? result.error : `${result.error.kind}: ${result.error.detail}`
  process.stderr.write(`the spreadsheet was not imported (${reason})\n`)
  process.exit(1)
}
const report = result.value
process.stdout.write(
  `${values['dry-run'] === true ? 'dry run: ' : ''}rows ${report.rows}, imported ${report.imported}, already imported ${report.alreadyImported}, unresolved parcel ${report.unresolvedParcel}, errors ${report.errors.length}\n`,
)
for (const e of report.errors) process.stdout.write(`row ${e.row}: ${e.detail}\n`)
