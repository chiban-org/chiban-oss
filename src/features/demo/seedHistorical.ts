import { createHash } from 'node:crypto'
import type { Db } from '@/db/client'
import { historicalRecords } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'

const SOURCE_FILE = 'alder-pond-permit-ledger-1987.xlsx'
const SOURCE_SHEET = 'Permits'
const SOURCE_SHA256 = createHash('sha256').update('alder-pond-demo-ledger-1987').digest('hex')

const RECORDS = [
  {
    recordType: 'Building',
    number: 'B-1987-014',
    recordedOn: '1987-03-04',
    description: 'Woodshed addition',
    values: { Contractor: 'Fernwood Carpentry', Fee: '25.00' },
    sourceRow: 3,
  },
  {
    recordType: 'Electrical',
    number: 'E-1987-006',
    recordedOn: '1987-06-18',
    description: 'Service upgrade to 100 amp',
    values: { Contractor: 'Larkspur Electric', Fee: '15.00' },
    sourceRow: 4,
  },
]

export async function seedHistorical(db: Db, admin: Actor, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const inserted = await db
    .insert(historicalRecords)
    .values(
      RECORDS.map((r) => ({
        ...r,
        sourceFile: SOURCE_FILE,
        sourceSha256: SOURCE_SHA256,
        sourceSheet: SOURCE_SHEET,
        importedBy: admin.userId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: historicalRecords.id })
  return inserted.length > 0
}
