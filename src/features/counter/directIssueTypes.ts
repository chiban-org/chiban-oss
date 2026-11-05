import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'

export interface DirectIssueType {
  key: string
  label: string
  formKey: string
  requiresLicense: boolean
}

export function requiresTradeLicense(body: Pick<ApplicationTypeBody, 'classification'>): boolean {
  return body.classification === 'nh.trade_permit'
}

export async function listDirectIssueTypes(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<DirectIssueType[]> {
  signal.throwIfAborted()
  const rows = await db
    .select()
    .from(configVersions)
    .where(and(eq(configVersions.kind, 'application_type'), eq(configVersions.status, 'published')))
  return rows
    .map((r) => ({ key: r.key, body: r.body as ApplicationTypeBody }))
    .filter((r) => r.body.workflow.allowsDirectIssue)
    .map((r) => ({
      key: r.key,
      label: r.body.label,
      formKey: r.body.formKey,
      requiresLicense: requiresTradeLicense(r.body),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
