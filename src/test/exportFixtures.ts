import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'

const SEED_NOW = new Date('2027-06-01T16:00:00Z')

const TOP_UPS: { table: string; statement: ReturnType<typeof sql> }[] = [
  {
    table: 'cutover_rows',
    statement: sql`insert into cutover_rows (legacy_number, application_id, imported_by, source_sha256)
      select 'LEGACY-EXPORT', id, gen_random_uuid(), 'abc' from applications limit 1`,
  },
  {
    table: 'cutover_reconciliations',
    statement: sql`insert into cutover_reconciliations (list_sha256, report, created_by)
      values ('abc', '{"inListAndImported":[],"inListNotImported":[],"importedNotInList":[],"documentCounts":{}}'::jsonb, gen_random_uuid())`,
  },
  {
    table: 'historical_records',
    statement: sql`insert into historical_records (record_type, number, recorded_on, description, values, source_file, source_sha256, source_sheet, source_row, imported_by)
      values ('Building', 'B-EXPORT', '1987-03-04', 'Coverage row', '{"Contractor":"Coverage"}'::jsonb, 'ledger.xlsx', 'abc', 'Permits', 3, gen_random_uuid())`,
  },
  {
    table: 'migration_batches',
    statement: sql`insert into migration_batches (name, source_root, series_key, folder_pattern, id_format, status, created_by)
      values ('Export coverage', '/srv/legacy', 'nh.rs.correspondence_administrative', '^Map (?<map>\\d+)', 'cama15', 'staged', gen_random_uuid())`,
  },
  {
    table: 'migration_items',
    statement: sql`insert into migration_items (batch_id, source_path, size_bytes, sha256, folder_key, outcome, document_id)
      select b.id, 'Map 7/scan.pdf', 12, 'abc', '007000000000000', 'imported', (select id from documents limit 1)
      from migration_batches b limit 1`,
  },
  {
    table: 'application_conditions',
    statement: sql`insert into application_conditions (application_id, code, text_snapshot, blocks_issuance, changed_by)
      select id, 'C-EXPORT', 'Condition kept for export coverage', false, gen_random_uuid() from applications limit 1`,
  },
  {
    table: 'gate_overrides',
    statement: sql`insert into gate_overrides (application_id, gate_key, kind, reason, created_by)
      select id, 'export.coverage', 'administrative_override', 'Coverage row', gen_random_uuid() from applications limit 1`,
  },
  {
    table: 'license_checks',
    statement: sql`insert into license_checks (application_id, license_number, license_type, result, lookup_url, checked_by)
      select id, 'EL-1', 'electrician', 'active', 'https://example.test/lookup', gen_random_uuid() from applications limit 1`,
  },
  {
    table: 'record_events',
    statement: sql`insert into record_events (project_id, kind, occurred_on, recorded_by_kind)
      select id, 'application_withdrawn', '2027-02-01', 'system' from projects limit 1`,
  },
  {
    table: 'remediation_tasks',
    statement: sql`insert into remediation_tasks (application_id, kind, description, transition_id)
      select id, 'review', 'Coverage row', 'T-EXPORT' from applications limit 1`,
  },
  {
    table: 'rule_transitions_applied',
    statement: sql`insert into rule_transitions_applied (id, applied_by, affected) values ('T-EXPORT', 'coverage', 1)`,
  },
  {
    table: 'calendar_accounts',
    statement: sql`insert into calendar_accounts (kind, tenant_id, client_id, client_secret_enc, created_by)
      values ('graph', 'tenant', 'client', 'v1:coverage', gen_random_uuid())`,
  },
  {
    table: 'parcel_record_carry_forwards',
    statement: sql`insert into parcel_record_carry_forwards (link_id, to_parcel_id, created_by)
      select l.id, (select id from parcels where id <> l.parcel_id limit 1), gen_random_uuid()
      from parcel_record_links l where l.parcel_id is not null limit 1`,
  },
  {
    table: 'board_packet_access',
    statement: sql`insert into board_packet_access (link_id) select id from board_packet_links limit 1`,
  },
  {
    table: 'processor_events',
    statement: sql`insert into processor_events (processor_account_id, event_id, type, raw)
      select id, 'evt_export', 'charge.succeeded', '{}'::jsonb from processor_accounts limit 1`,
  },
]

async function ensureProcessorAccount(db: Db): Promise<void> {
  await db.execute(sql`insert into processor_accounts (processor, mode, account_ref, credentials_enc, webhook_secret_enc, created_by)
    select 'stripe', 'test', 'acct_export', 'v1:coverage', 'v1:coverage', gen_random_uuid()
    where not exists (select 1 from processor_accounts)`)
}

export async function topUpEmptyEntities(db: Db): Promise<void> {
  await ensureProcessorAccount(db)
  for (const top of TOP_UPS) {
    const present = await db.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from "${top.table}"`),
    )
    if ((present.rows[0]?.n ?? 0) === 0) await db.execute(top.statement)
  }
}

export async function seedExportTown(db: Db, signal: AbortSignal): Promise<void> {
  await seedDemo(db, signal, {
    records: { mail: createMemoryTransport() },
    inspections: { now: SEED_NOW },
  })
  await topUpEmptyEntities(db)
}
