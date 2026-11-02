import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { seedDemo } from '@/features/demo/seedDemo'
import { demoSeedDeps } from '@/test/demoSeedDeps'

const TOP_UPS: { table: string; statement: ReturnType<typeof sql> }[] = [
  {
    table: 'peril_certifications',
    statement: sql`insert into peril_certifications (appeal_id, certified_on, certified_by, categories, statement)
      select id, filed_on, gen_random_uuid(), array['safety'], 'Coverage row' from enforcement_appeals limit 1`,
  },
  {
    table: 'restraining_orders',
    statement: sql`insert into restraining_orders (appeal_id, issued_by, issued_on, document_id)
      select a.id, 'zba', a.filed_on, (select id from documents limit 1) from enforcement_appeals a limit 1`,
  },
  {
    table: 'anonymous_intake_verifications',
    statement: sql`insert into anonymous_intake_verifications (app_version, caddyfile_sha256, passed, findings)
      values ('0.0.0', repeat('c', 64), true, '[]'::jsonb)`,
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
  await seedDemo(db, signal, await demoSeedDeps())
  await topUpEmptyEntities(db)
}
