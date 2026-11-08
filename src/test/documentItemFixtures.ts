import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import type { DocumentItem } from '@/features/applications/documentItemSchema'
import type { CoreState } from '@/features/applications/states'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { appTypeBody } from '@/test/configFixtures'

const signal = new AbortController().signal

export const PLOT_PLAN: DocumentItem = {
  key: 'plot_plan',
  label: 'Plot plan',
  stage: 'to_file',
  waivable: false,
}
export const FLOOR_PLANS: DocumentItem = {
  key: 'floor_plans',
  label: 'Floor plans and framing',
  stage: 'to_file',
  waivable: false,
}
export const OWNER_AUTHORIZATION: DocumentItem = {
  key: 'owner_authorization',
  label: 'Owner authorization',
  stage: 'to_file',
  waivable: false,
  requiredIf: { field: 'classification', op: 'equals', value: 'nonresidential' },
}
export const LANDSCAPING: DocumentItem = {
  key: 'landscaping_plan',
  label: 'Landscaping plan',
  stage: 'to_file',
  waivable: true,
}
export const DECISION_STUDY: DocumentItem = {
  key: 'drainage_study',
  label: 'Drainage study',
  stage: 'before_decision',
  waivable: false,
}
export const SEPTIC: DocumentItem = {
  key: 'septic_approval',
  label: 'State septic approval',
  stage: 'before_issue',
  waivable: false,
}
export const BLOWER_DOOR: DocumentItem = {
  key: 'blower_door',
  label: 'Blower door test result',
  stage: 'before_co',
  waivable: false,
}

export const ITEMS = [
  PLOT_PLAN,
  FLOOR_PLANS,
  OWNER_AUTHORIZATION,
  LANDSCAPING,
  DECISION_STUDY,
  SEPTIC,
  BLOWER_DOOR,
]

export const ATTESTATION_HASH = attestationHash(appTypeBody().attestationText)

export async function submitAs(
  db: Db,
  actor: Actor,
  applicationId: string,
  values: Record<string, unknown> = { classification: 'residential' },
) {
  return await submitApplication(
    db,
    actor,
    { applicationId, values, attestation: { statementSha256: ATTESTATION_HASH } },
    signal,
    new Date('2027-03-02T15:00:00Z'),
  )
}

export async function moveTo(db: Db, actor: Actor, applicationId: string, to: CoreState) {
  const [row] = await db.select().from(applications).where(eq(applications.id, applicationId))
  return await db.transaction((tx) =>
    transitionApplication(
      tx,
      actor,
      { applicationId, to, expectedRowVersion: row?.rowVersion ?? 0 },
      signal,
    ),
  )
}

export function blockedKeys(result: { ok: boolean; error?: unknown }): string[] {
  if (result.ok || typeof result.error !== 'object' || result.error === null) return []
  if (!('gateBlocked' in result.error)) return []
  const gates = result.error.gateBlocked as { key: string; effective: string }[]
  return gates.filter((g) => g.effective === 'blocked').map((g) => g.key)
}
