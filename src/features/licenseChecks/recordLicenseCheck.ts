import { NH_LICENSE_LOOKUP } from '@packs/nh/links'
import { and, eq, ne } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applicationConditions, applications, licenseChecks } from '@/db/schema'
import type { LicenseResult } from '@/db/schema/licenseChecks'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { isTerminalState } from '@/features/applications/states'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { hasFullRecordAccess } from '@/features/projects/access'
import { err, ok, type Result } from '@/types/result'
import {
  applicationLicenseNumber,
  failedCheckReason,
  LICENSE_CONDITION_CODE,
  type LicenseCheckFacts,
  licenseCheckApplies,
  namesSameLicense,
} from './licenseRules'

export interface RecordLicenseCheckInput {
  applicationId: string
  licenseNumber: string
  licenseType: string
  result: LicenseResult
  note: string | null
  checkedAt?: Date
}

export type RecordLicenseCheckError =
  | 'forbidden'
  | 'not_found'
  | 'not_applicable'
  | 'application_closed'
  | 'license_mismatch'

async function mayRecord(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return (
    hasFullRecordAccess(actor) && (await hasCapability(db, actor.userId, 'permit.issue', signal))
  )
}

async function settleLicenseCondition(
  tx: Tx,
  actor: Actor,
  check: LicenseCheckFacts & { applicationId: string },
  now: Date,
): Promise<string | null> {
  const active = check.result === 'active'
  const [updated] = await tx
    .update(applicationConditions)
    .set({
      status: active ? 'met' : 'unmet',
      statusReason: active ? null : failedCheckReason(check),
      changedBy: actor.userId,
      changedAt: now,
    })
    .where(
      and(
        eq(applicationConditions.applicationId, check.applicationId),
        eq(applicationConditions.code, LICENSE_CONDITION_CODE),
        ne(applicationConditions.status, 'waived'),
      ),
    )
    .returning({ id: applicationConditions.id })
  return updated?.id ?? null
}

export async function recordLicenseCheck(
  db: Db,
  actor: Actor,
  input: RecordLicenseCheckInput,
  signal: AbortSignal,
): Promise<Result<{ checkId: string }, RecordLicenseCheckError>> {
  signal.throwIfAborted()
  const now = input.checkedAt ?? new Date()
  if (!(await mayRecord(db, actor, signal))) return err('forbidden')
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (!licenseCheckApplies({ classification: app.typeBody.classification, values: app.values })) {
    return err('not_applicable')
  }
  if (!namesSameLicense(input.licenseNumber, applicationLicenseNumber(app.values))) {
    return err('license_mismatch')
  }
  return await transactionResult(db, async (tx) => {
    const [locked] = await tx
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    if (locked === undefined) return err('not_found')
    if (isTerminalState(locked.state)) return err('application_closed')
    const [row] = await tx
      .insert(licenseChecks)
      .values({
        applicationId: input.applicationId,
        licenseNumber: input.licenseNumber,
        licenseType: input.licenseType,
        result: input.result,
        note: input.note,
        lookupUrl: NH_LICENSE_LOOKUP.url,
        checkedBy: actor.userId,
        checkedAt: now,
      })
      .returning({ id: licenseChecks.id })
    const checkId = row?.id ?? ''
    const conditionId = await settleLicenseCondition(tx, actor, input, now)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'license_check.record',
        entityType: 'application',
        entityId: input.applicationId,
        after: { checkId, result: input.result, licenseNumber: input.licenseNumber, conditionId },
      },
      signal,
    )
    return ok({ checkId })
  })
}
