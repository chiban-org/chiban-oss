import { nhDefaultLicenseType } from '@packs/nh/licenseTypes'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { users } from '@/db/schema'
import type { LicenseResult } from '@/db/schema/licenseChecks'
import { loadApplicationContext } from '@/features/applications/context'
import { isTerminalState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { LICENSE_FIELD } from '@/features/forms/formReferences'
import { hasFullRecordAccess } from '@/features/projects/access'
import { townTimeZone } from '@/features/town/timeZone'
import { formatInstant } from '@/lib/formatDate'
import { latestLicenseCheck } from './latestLicenseCheck'
import { LICENSE_RESULT_LABELS, licenseCheckApplies } from './licenseRules'

export interface LatestLicenseCheck {
  result: LicenseResult
  resultLabel: string
  licenseNumber: string
  licenseType: string
  note: string | null
  checkedBy: string
  checkedOn: string
}

export interface LicenseCheckPanelData {
  applicationId: string
  enteredNumber: string | null
  defaultType: string
  latest: LatestLicenseCheck | null
  canRecord: boolean
}

function enteredNumber(values: Readonly<Record<string, unknown>>): string | null {
  const value = new Map(Object.entries(values)).get(LICENSE_FIELD)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

async function describeLatest(
  db: Db,
  applicationId: string,
  signal: AbortSignal,
): Promise<LatestLicenseCheck | null> {
  const row = await latestLicenseCheck(db, applicationId)
  if (row === null) return null
  const [[checker], zone] = await Promise.all([
    db.select({ name: users.displayName }).from(users).where(eq(users.id, row.checkedBy)),
    townTimeZone(db, signal),
  ])
  return {
    result: row.result,
    resultLabel: LICENSE_RESULT_LABELS[row.result],
    licenseNumber: row.licenseNumber,
    licenseType: row.licenseType,
    note: row.note,
    checkedBy: checker?.name ?? 'a staff member no longer listed',
    checkedOn: formatInstant(row.checkedAt, zone),
  }
}

export async function loadLicenseCheckPanel(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<LicenseCheckPanelData | null> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return null
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  if (!licenseCheckApplies({ classification: app.typeBody.classification, values: app.values })) {
    return null
  }
  const [latest, issues] = await Promise.all([
    describeLatest(db, applicationId, signal),
    hasCapability(db, actor.userId, 'permit.issue', signal),
  ])
  return {
    applicationId,
    enteredNumber: enteredNumber(app.values),
    defaultType: nhDefaultLicenseType(app.typeBody.key) ?? '',
    latest,
    canRecord: issues && !isTerminalState(app.state),
  }
}
