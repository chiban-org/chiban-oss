import { createHash } from 'node:crypto'
import { parse } from 'csv-parse/sync'
import {
  CUTOVER_FEES_PAID_TRUE,
  CUTOVER_FEES_PAID_VALUES,
  CUTOVER_REQUIRED_COLUMNS,
  CUTOVER_STATES,
  type CutoverState,
} from '@/features/cutover/columns'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface CutoverRow {
  line: number
  legacyNumber: string
  applicationTypeKey: string
  parcelFormat: string | undefined
  parcelId: string
  projectTitle: string
  applicantName: string
  applicantEmail: string | undefined
  ownerName: string | undefined
  contractorName: string | undefined
  contractorEmail: string | undefined
  contractorLicenseNumber: string | undefined
  state: CutoverState
  receivedDate: CivilDate
  completedDate: CivilDate | null
  decidedOn: CivilDate | null
  issuedOn: CivilDate | null
  feesPaid: boolean
  priorReceiptRef: string
  fields: Record<string, string>
  errors: string[]
}

export interface ParsedCutover {
  rows: CutoverRow[]
  sourceSha256: string
}

type Raw = Record<string, string>

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim() ?? ''
  return t === '' ? undefined : t
}

function dateOf(raw: Raw, key: string, errors: string[]): CivilDate | null {
  const value = clean(raw[key])
  if (value === undefined) return null
  const parsed = parseCivilDate(value)
  if (!parsed.ok) {
    errors.push(`invalid_${key}`)
    return null
  }
  return parsed.value
}

function toRow(raw: Raw, line: number): CutoverRow {
  const errors: string[] = []
  const state = CUTOVER_STATES.find((s) => s === clean(raw.state))
  if (state === undefined) errors.push('invalid_state')
  const receivedDate = dateOf(raw, 'received_date', errors)
  if (receivedDate === null && !errors.includes('invalid_received_date'))
    errors.push('received_date_required')
  const completedDate = dateOf(raw, 'completed_date', errors)
  const decidedOn = dateOf(raw, 'decided_on', errors)
  const issuedOn = dateOf(raw, 'issued_on', errors)
  if (state === 'issued' && issuedOn === null && !errors.includes('invalid_issued_on')) {
    errors.push('issued_on_required')
  }
  if (state === 'decided' && decidedOn === null && !errors.includes('invalid_decided_on')) {
    errors.push('decided_on_required')
  }
  const feesRaw = (clean(raw.fees_paid_in_prior_system) ?? '').toLowerCase()
  const knownFees: readonly string[] = CUTOVER_FEES_PAID_VALUES
  if (feesRaw !== '' && !knownFees.includes(feesRaw))
    errors.push('invalid_fees_paid_in_prior_system')
  const trueFees: readonly string[] = CUTOVER_FEES_PAID_TRUE
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('field.') && clean(value) !== undefined) fields[key.slice(6)] = value.trim()
  }
  const legacyNumber = clean(raw.legacy_number) ?? ''
  if (legacyNumber === '') errors.push('legacy_number_required')
  return {
    line,
    legacyNumber,
    applicationTypeKey: clean(raw.application_type_key) ?? '',
    parcelFormat: clean(raw.parcel_id_format),
    parcelId: clean(raw.parcel_id) ?? '',
    projectTitle: clean(raw.project_title) ?? legacyNumber,
    applicantName: clean(raw.applicant_name) ?? 'Applicant from the prior system',
    applicantEmail: clean(raw.applicant_email),
    ownerName: clean(raw.owner_name),
    contractorName: clean(raw.contractor_name),
    contractorEmail: clean(raw.contractor_email),
    contractorLicenseNumber: clean(raw.contractor_license_number),
    state: state ?? 'submitted',
    receivedDate: receivedDate ?? ('1970-01-01' as CivilDate),
    completedDate,
    decidedOn,
    issuedOn,
    feesPaid: trueFees.includes(feesRaw),
    priorReceiptRef: clean(raw.prior_receipt_ref) ?? 'no receipt reference',
    fields,
    errors,
  }
}

export function parseCutoverCsv(bytes: Uint8Array): Result<ParsedCutover, 'malformed'> {
  try {
    const records = parse(Buffer.from(bytes), {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
    }) as Raw[]
    const first = records[0]
    const headers = first === undefined ? [] : Object.keys(first)
    if (CUTOVER_REQUIRED_COLUMNS.some((c) => !headers.includes(c))) return err('malformed')
    return ok({
      rows: records.map((raw, i) => toRow(raw, i + 2)),
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    })
  } catch {
    return err('malformed')
  }
}
