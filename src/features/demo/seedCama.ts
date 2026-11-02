import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { importExceptions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { DEFAULT_CAMA_COLUMNS, DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { runCamaImport } from '@/features/cama/runCamaImport'
import { saveCamaMapping } from '@/features/cama/saveMapping'
import { must } from '@/features/demo/seedPermitSupport'

const CHANGED_OWNER_ROW = [
  '007',
  '003',
  '000',
  '000',
  'Marlowe Holdings LLC',
  '',
  'PO Box 102',
  '',
  'Alder Pond',
  'NH',
  '03999',
  '16',
  'Heron Cove Road',
]

function changedOwnerCsv(): Uint8Array {
  const lines = [DEFAULT_CAMA_COLUMNS.join(','), CHANGED_OWNER_ROW.join(',')]
  return new TextEncoder().encode(`${lines.join('\n')}\n`)
}

export async function seedCama(db: Db, admin: Actor, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const held = await db
    .select({ id: importExceptions.id })
    .from(importExceptions)
    .where(eq(importExceptions.layerKey, 'cama'))
  if (held.length > 0) return false
  must(await saveCamaMapping(db, admin, DEFAULT_CAMA_MAPPING, signal), 'save CAMA mapping')
  must(
    await runCamaImport(db, admin, { bytes: changedOwnerCsv(), fullLayer: false }, signal),
    'CAMA import',
  )
  return true
}
