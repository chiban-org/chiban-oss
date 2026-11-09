import type { LicenseResult } from '@/db/schema/licenseChecks'
import { requiresTradeLicense } from '@/features/counter/directIssueTypes'
import type { GateOutcome } from '@/features/gates/registry'

export const LICENSE_GATE_KEY = 'trade.state_license_active'
export const LICENSE_CONDITION_CODE = 'LICENSE'

export const LICENSE_RESULT_LABELS: Readonly<Record<LicenseResult, string>> = {
  active: 'Active',
  not_found: 'Not found',
  expired: 'Expired',
  inactive: 'Inactive',
}

export interface LicenseCheckFacts {
  result: LicenseResult
  licenseNumber: string
  note: string | null
}

export function licenseCheckApplies(input: {
  classification: string | null | undefined
  values: Readonly<Record<string, unknown>>
}): boolean {
  return (
    requiresTradeLicense({ classification: input.classification ?? '' }) &&
    input.values.work_by !== 'owner'
  )
}

export function failedCheckReason(check: LicenseCheckFacts): string {
  const found = `The latest state license check found license ${check.licenseNumber} ${LICENSE_RESULT_LABELS[check.result].toLowerCase()}.`
  const note = check.note?.trim() ?? ''
  return note === '' ? found : `${found} ${note.replace(/\.+$/, '')}.`
}

export function licenseGateOutcome(latest: LicenseCheckFacts | null): GateOutcome {
  if (latest === null) return { status: 'blocked', reason: 'No state license check is recorded.' }
  if (latest.result === 'active') return { status: 'pass' }
  return { status: 'blocked', reason: failedCheckReason(latest) }
}
