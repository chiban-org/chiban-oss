import { and, asc, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projectParties, projects, users } from '@/db/schema'
import { makeRecipient } from '@/features/abutters/recipientBasis'
import type { Recipient } from '@/features/abutters/resolution'
import type { IncompleteReason } from '@/features/abutters/types'
import { formApplicantName, namedParty } from '@/features/applications/applicantName'

const FORM_ADDRESS_FIELD = 'applicant_mailing_address'

export async function applicationValues(
  db: DbOrTx,
  applicationId: string,
): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ values: applications.values })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return (row?.values ?? {}) as Record<string, unknown>
}

export async function applicantName(
  db: DbOrTx,
  applicationId: string,
  values: Record<string, unknown>,
): Promise<string | null> {
  const [row] = await db
    .select({ name: projectParties.name, displayName: users.displayName })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .innerJoin(projectParties, eq(projectParties.projectId, projects.id))
    .leftJoin(users, eq(users.id, projectParties.userId))
    .where(
      and(
        eq(applications.id, applicationId),
        eq(projectParties.role, 'applicant'),
        sql`${projectParties.removedAt} is null`,
      ),
    )
    .orderBy(asc(projectParties.addedAt))
    .limit(1)
  const fromForm = formApplicantName(values)
  if (row === undefined) return fromForm
  return fromForm ?? namedParty(row.name) ?? row.displayName ?? null
}

export async function applicantRecipient(
  db: DbOrTx,
  applicationId: string,
  incomplete: IncompleteReason[],
): Promise<Recipient> {
  const values = await applicationValues(db, applicationId)
  const address = new Map(Object.entries(values)).get(FORM_ADDRESS_FIELD)
  const entry = makeRecipient(
    await applicantName(db, applicationId, values),
    typeof address === 'string' ? address : null,
    {
      roles: ['applicant'],
      parcelIds: [],
      provenance: [
        {
          source: 'application_form',
          ref: applicationId,
          asOf: null,
          ageDays: null,
          state: 'entered',
        },
      ],
    },
  )
  if (entry.status === 'incomplete_data') {
    incomplete.push({
      role: 'applicant',
      code: entry.name === '' ? 'owner_missing' : 'address_missing',
      detail:
        entry.name === ''
          ? 'The application has no applicant name on record.'
          : 'The application has no applicant mailing address.',
    })
  }
  return entry
}
