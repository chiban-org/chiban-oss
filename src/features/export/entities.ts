import { getTableName } from 'drizzle-orm'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { AppError, ErrorIds } from '@/constants/errorIds'
import * as t from '@/db/schema'

export interface ExportEntity {
  name: string
  table: PgTable
  file: string
  importMode: 'insert' | 'replace'
  orderBy: string[]
  refs: { column: string; entity: string }[]
  polyRefs: { kindColumn: string; idColumn: string; map: Record<string, string> }[]
  omitColumns: string[]
  omitFill: Record<string, string>
}

export const SECRET_COLUMN_PATTERN = /(_enc|_hash|secret|token)$/

export const HASH_COLUMNS_ALLOWED = [
  'statement_sha256',
  'body_sha256',
  'file_sha256',
  'sha256',
  'input_hash',
  'content_hash',
]

const RANDOM_HASH = `encode(gen_random_bytes(32), 'hex')`

interface Spec {
  table: PgTable
  importMode?: ExportEntity['importMode']
  omit?: string[]
  fill?: Record<string, string>
  poly?: ExportEntity['polyRefs']
}

const SPECS: Spec[] = [
  { table: t.abutterListCandidates },
  { table: t.abutterListRecipients },
  { table: t.abutterLists },
  { table: t.acceptanceSchedules },
  { table: t.agendaItems },
  { table: t.agendas },
  { table: t.aliasOverrides },
  { table: t.applicationParcels },
  { table: t.appeals },
  { table: t.applicationConditions },
  { table: t.applicationProfessionals },
  { table: t.applicationNumberCounters },
  { table: t.applicationSnapshots },
  { table: t.applications },
  { table: t.attestations },
  { table: t.associationRosters },
  { table: t.auditLog },
  { table: t.boardPacketAccess },
  { table: t.boardPacketItems },
  { table: t.boardPacketLinks, omit: ['token_hash'], fill: { token_hash: RANDOM_HASH } },
  { table: t.boardDecisions },
  { table: t.boardMeetings },
  { table: t.boardPackets },
  {
    table: t.calendarAccounts,
    omit: ['client_secret_enc'],
    fill: { client_secret_enc: `''` },
  },
  { table: t.calendarPushes },
  { table: t.certificatesOfOccupancy },
  { table: t.clockAdjustments },
  { table: t.clocks },
  { table: t.completenessVotes },
  { table: t.codeEditionRecords },
  { table: t.configVersions },
  { table: t.contractorClaims, omit: ['token_hash'], fill: { token_hash: RANDOM_HASH } },
  { table: t.cutoverReconciliations },
  { table: t.cutoverRows },
  { table: t.desProximityDeterminations },
  { table: t.documentText },
  { table: t.documentVersions },
  {
    table: t.documents,
    poly: [
      {
        kindColumn: 'record_kind',
        idColumn: 'record_id',
        map: {
          application: 'applications',
          inspection: 'inspections',
          project: 'projects',
          parcel: 'parcels',
          meeting: 'board_meetings',
          migration_batch: 'migration_batches',
        },
      },
    ],
  },
  {
    table: t.exportTargets,
    omit: [
      'credentials_enc',
      'run_requested_at',
      'last_success_at',
      'last_failure_at',
      'last_error',
    ],
  },
  { table: t.feeAssessments },
  { table: t.feeOverrides },
  { table: t.files },
  { table: t.gateOverrides },
  { table: t.gisFeatures },
  { table: t.gisLayers, importMode: 'replace' },
  { table: t.hearings },
  { table: t.historicalRecords },
  { table: t.importExceptions },
  { table: t.importRuns },
  { table: t.inspectionItemResults },
  { table: t.inspections },
  { table: t.inspectorCalendars },
  { table: t.ledgerAllocations },
  { table: t.ledgerEntries },
  {
    table: t.legalHolds,
    poly: [
      {
        kindColumn: 'target_kind',
        idColumn: 'target_id',
        map: { project: 'projects', application: 'applications', document: 'documents' },
      },
    ],
  },
  { table: t.licenseChecks },
  { table: t.migrationBatches },
  { table: t.migrationItems },
  { table: t.noticeItems },
  { table: t.noticeProofSupersessions },
  { table: t.noticeProofs },
  { table: t.noticeSets },
  { table: t.notificationOutbox },
  { table: t.parcelAliases },
  { table: t.parcelIdFormats, importMode: 'replace' },
  { table: t.parcelLineageEvents },
  { table: t.parcelLineageLinks },
  { table: t.parcelRecordCarryForwards },
  {
    table: t.parcelRecordLinks,
    poly: [
      {
        kindColumn: 'record_kind',
        idColumn: 'record_id',
        map: {
          application: 'applications',
          inspection: 'inspections',
          document: 'documents',
          historical_record: 'historical_records',
        },
      },
    ],
  },
  { table: t.parcels },
  { table: t.parkRosters },
  { table: t.paymentAttemptTransitions },
  { table: t.paymentAttempts },
  { table: t.preservationRecords },
  {
    table: t.processorAccounts,
    omit: ['credentials_enc', 'webhook_secret_enc', 'is_active'],
    fill: { credentials_enc: `''`, webhook_secret_enc: `''` },
  },
  { table: t.processorEvents, omit: ['raw'], fill: { raw: `'{}'::jsonb` } },
  { table: t.projectParties },
  { table: t.projects },
  { table: t.receiptNumberCounters },
  { table: t.receipts },
  { table: t.recordEvents },
  { table: t.refundRequests },
  { table: t.regionalImpactDeterminations },
  { table: t.regionalImpactNotices },
  { table: t.regionalImpactParties },
  { table: t.relianceLinks },
  { table: t.remediationTasks },
  {
    table: t.retentionAssignments,
    poly: [
      {
        kindColumn: 'record_kind',
        idColumn: 'record_id',
        map: { document: 'documents', application_snapshot: 'application_snapshots' },
      },
    ],
  },
  { table: t.restrictionHoldings },
  { table: t.reviewAssignments },
  { table: t.reviewComments },
  { table: t.roleCapabilities, importMode: 'replace' },
  { table: t.rosterReviews },
  { table: t.ruleTransitionsApplied },
  { table: t.selectmenCertifications },
  { table: t.townSettings, importMode: 'replace' },
  { table: t.userRoles },
  {
    table: t.users,
    omit: ['password_hash', 'totp_secret_enc', 'totp_enabled', 'totp_last_counter'],
  },
]

function orderColumns(table: PgTable): string[] {
  const config = getTableConfig(table)
  const composite = config.primaryKeys[0]?.columns.map((c) => c.name)
  if (composite !== undefined) return composite
  const primary = config.columns.filter((c) => c.primary).map((c) => c.name)
  return primary.length > 0 ? primary : config.columns.map((c) => c.name)
}

function build(spec: Spec): ExportEntity {
  const name = getTableName(spec.table)
  const config = getTableConfig(spec.table)
  return {
    name,
    table: spec.table,
    file: `data/${name}.ndjson`,
    importMode: spec.importMode ?? 'insert',
    orderBy: orderColumns(spec.table),
    refs: config.foreignKeys.map((fk) => {
      const ref = fk.reference()
      return {
        column: ref.columns[0]?.name ?? '',
        entity: getTableName(ref.foreignTable),
      }
    }),
    polyRefs: spec.poly ?? [],
    omitColumns: [
      ...(spec.omit ?? []),
      ...config.columns.filter((c) => c.generated !== undefined).map((c) => c.name),
    ],
    omitFill: spec.fill ?? {},
  }
}

export const EXPORT_ENTITIES: ExportEntity[] = SPECS.map(build)

export function exportOrder(entities: ExportEntity[]): ExportEntity[] {
  const byName = new Map(entities.map((e) => [e.name, e]))
  const placed = new Set<string>()
  const visiting = new Set<string>()
  const result: ExportEntity[] = []
  const visit = (entity: ExportEntity): void => {
    if (placed.has(entity.name)) return
    if (visiting.has(entity.name))
      throw new AppError(ErrorIds.EXPORT_REF_CYCLE, 'export reference cycle', {
        entity: entity.name,
      })
    visiting.add(entity.name)
    for (const ref of entity.refs) {
      const target = byName.get(ref.entity)
      if (target !== undefined && target.name !== entity.name) visit(target)
    }
    visiting.delete(entity.name)
    placed.add(entity.name)
    result.push(entity)
  }
  for (const entity of [...entities].sort((a, b) => a.name.localeCompare(b.name))) visit(entity)
  return result
}
