import type { Db } from '@/db/client'
import { cutoverReconciliations } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { CUTOVER_BASE_COLUMNS } from '@/features/cutover/columns'
import { importCutoverCsv } from '@/features/cutover/importCutover'
import { reconcileCutover } from '@/features/cutover/reconcile'
import { must } from '@/features/demo/seedPermitSupport'

const EXTRA_COLUMNS = [
  'field.description',
  'field.contractor_license_number',
  'field.work_type',
  'field.classification',
  'field.dwelling_units',
] as const
const COLUMNS = [...CUTOVER_BASE_COLUMNS, ...EXTRA_COLUMNS]
const MISSING_NUMBER = 'LEG-1996-0207'
const IMPORT_AT = new Date('2026-05-20T15:00:00Z')

type Row = Partial<Record<(typeof COLUMNS)[number], string>>

const ROWS: Row[] = [
  {
    legacy_number: 'LEG-1996-0114',
    application_type_key: 'EL',
    parcel_id_format: 'gis12',
    parcel_id: '007001000000',
    project_title: 'Service upgrade',
    applicant_name: 'Mara Quillfeather',
    state: 'issued',
    fees_paid_in_prior_system: 'yes',
    prior_receipt_ref: 'Ledger 1996-0114',
    received_date: '2026-02-01',
    issued_on: '2026-02-10',
    'field.description': 'Service upgrade to 200 amp',
    'field.contractor_license_number': 'EL-4401',
  },
  {
    legacy_number: 'LEG-1996-0152',
    application_type_key: 'BP',
    parcel_id_format: 'gis12',
    parcel_id: '007003000000',
    project_title: 'Boathouse',
    applicant_name: 'Odessa Quillfeather',
    state: 'under_review',
    received_date: '2026-03-01',
    completed_date: '2026-03-05',
    'field.work_type': 'building',
    'field.description': 'Lakeside boathouse',
    'field.classification': 'residential',
    'field.dwelling_units': '1',
  },
  {
    legacy_number: 'LEG-1996-0188',
    application_type_key: 'EL',
    parcel_id_format: 'gis12',
    parcel_id: '007004000000',
    project_title: 'Barn lighting',
    applicant_name: 'Ellis Fernwood',
    state: 'issued',
    fees_paid_in_prior_system: 'yes',
    prior_receipt_ref: 'Ledger 1996-0188',
    received_date: '2026-03-12',
    issued_on: '2026-03-20',
    'field.description': 'New barn lighting circuit',
    'field.contractor_license_number': 'EL-4402',
  },
]

function csv(rows: Row[]): Uint8Array {
  const body = rows.map((r) => COLUMNS.map((c) => `"${r[c] ?? ''}"`).join(','))
  return new TextEncoder().encode([COLUMNS.join(','), ...body].join('\n'))
}

function legacyList(): Uint8Array {
  const numbers = [...ROWS.map((r) => r.legacy_number ?? ''), MISSING_NUMBER]
  return new TextEncoder().encode(['legacy_number', ...numbers].join('\n'))
}

export async function seedCutover(db: Db, staff: Actor, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const imported = must(
    await importCutoverCsv(db, staff, { bytes: csv(ROWS), dryRun: false, now: IMPORT_AT }, signal),
    'cutover import',
  )
  const failed = imported.rows.filter((r) => r.outcome === 'error')
  if (failed.length > 0) must({ ok: false, error: failed }, 'cutover rows')
  const existing = await db.select({ id: cutoverReconciliations.id }).from(cutoverReconciliations)
  if (existing.length > 0) return imported.counts.imported > 0
  must(await reconcileCutover(db, staff, { listBytes: legacyList() }, signal), 'reconcile cutover')
  return true
}
