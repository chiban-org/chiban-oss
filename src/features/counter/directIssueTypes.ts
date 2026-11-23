import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { Actor } from '@/features/auth/actor'
import { intakeOpen } from '@/features/buildingProgram/intake'
import { getBuildingProgram } from '@/features/buildingProgram/settings'
import { mayUseCounterFor } from '@/features/counter/counterAccess'
import { packRoles } from '@/features/packs/roles'

export interface DirectIssueType {
  key: string
  label: string
  formKey: string
  requiresLicense: boolean
}

export interface ReviewIntakeType {
  key: string
  label: string
  payTiming: ApplicationTypeBody['payTiming']
}

export interface CounterTypes {
  issueToday: DirectIssueType[]
  takeForReview: ReviewIntakeType[]
}

export function requiresTradeLicense(body: Pick<ApplicationTypeBody, 'classification'>): boolean {
  const trade = packRoles().classifications.tradePermit
  return trade !== null && body.classification === trade
}

async function publishedTypes(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<{ key: string; body: ApplicationTypeBody }[]> {
  signal.throwIfAborted()
  const rows = await db
    .select()
    .from(configVersions)
    .where(and(eq(configVersions.kind, 'application_type'), eq(configVersions.status, 'published')))
  return rows
    .map((r) => ({ key: r.key, body: r.body as ApplicationTypeBody }))
    .sort((a, b) => a.body.label.localeCompare(b.body.label))
}

function directIssueType(r: { key: string; body: ApplicationTypeBody }): DirectIssueType {
  return {
    key: r.key,
    label: r.body.label,
    formKey: r.body.formKey,
    requiresLicense: requiresTradeLicense(r.body),
  }
}

async function issuesToday(
  db: DbOrTx,
  actor: Actor | undefined,
  body: ApplicationTypeBody,
  signal: AbortSignal,
): Promise<boolean> {
  if (!body.workflow.allowsDirectIssue) return false
  return actor === undefined || (await mayUseCounterFor(db, actor, body.classification, signal))
}

export async function listCounterTypes(
  db: DbOrTx,
  signal: AbortSignal,
  actor?: Actor,
): Promise<CounterTypes> {
  const program = await getBuildingProgram(db, signal)
  const types = (await publishedTypes(db, signal)).filter((r) =>
    intakeOpen(r.body.classification, program),
  )
  const today = new Set<string>()
  for (const r of types) if (await issuesToday(db, actor, r.body, signal)) today.add(r.key)
  return {
    issueToday: types.filter((r) => today.has(r.key)).map(directIssueType),
    takeForReview: types
      .filter((r) => !today.has(r.key))
      .map((r) => ({ key: r.key, label: r.body.label, payTiming: r.body.payTiming })),
  }
}
