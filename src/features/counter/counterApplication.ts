import { NH_LICENSE_LOOKUP } from '@packs/nh/links'
import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applications, licenseChecks, parcels, projects } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { createApplication } from '@/features/applications/createApplication'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import type { Actor } from '@/features/auth/actor'
import type { QuickIssueError, QuickIssueInput } from '@/features/counter/quickIssue'
import { displayIdsFor } from '@/features/parcels/displayId'
import { addParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import { err, ok, type Result } from '@/types/result'

async function counterTitle(tx: Tx, typeLabel: string, parcelId: string): Promise<string> {
  const [parcel] = await tx
    .select({ siteAddress: parcels.siteAddress })
    .from(parcels)
    .where(eq(parcels.id, parcelId))
  const display = await displayIdsFor(tx, [parcelId])
  const where = parcel?.siteAddress ?? display.get(parcelId) ?? 'parcel on file'
  return `${typeLabel}, ${where}`
}

export interface CounterTarget {
  applicationId: string
  number: string
}

export async function retryableApplication(
  tx: Tx,
  input: QuickIssueInput,
  applicationId: string,
): Promise<Result<CounterTarget, 'not_found'>> {
  const [row] = await tx
    .select({ id: applications.id, number: applications.number })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.state, 'submitted'),
        eq(applications.applicationTypeKey, input.applicationTypeKey),
        eq(projects.parcelId, input.parcelId),
      ),
    )
  return row === undefined ? err('not_found') : ok({ applicationId: row.id, number: row.number })
}

export async function createCounterApplication(
  tx: Tx,
  actor: Actor,
  context: { input: QuickIssueInput; typeBody: ApplicationTypeBody },
  signal: AbortSignal,
  now: Date,
): Promise<Result<CounterTarget, QuickIssueError>> {
  const { input, typeBody } = context
  const project = await createProject(
    tx,
    actor,
    { parcelId: input.parcelId, title: await counterTitle(tx, typeBody.label, input.parcelId) },
    signal,
  )
  if (!project.ok) return err(project.error)
  const party = await addParty(
    tx,
    actor,
    {
      projectId: project.value.projectId,
      role: 'contractor',
      name: input.contractor.name,
      email: input.contractor.email,
    },
    signal,
  )
  if (!party.ok) return err(party.error)
  const application = await createApplication(
    tx,
    actor,
    { projectId: project.value.projectId, applicationTypeKey: input.applicationTypeKey },
    signal,
    now,
  )
  if (!application.ok) return err(application.error)
  const applicationId = application.value.applicationId
  const submitted = await submitApplication(
    tx,
    actor,
    {
      applicationId,
      values:
        input.license === undefined
          ? input.values
          : { ...input.values, contractor_license_number: input.license.number },
      attestation: { statementSha256: attestationHash(typeBody.attestationText) },
    },
    signal,
    now,
  )
  if (!submitted.ok) return err(submitted.error)
  if (input.license !== undefined) {
    await tx.insert(licenseChecks).values({
      applicationId,
      licenseNumber: input.license.number,
      licenseType: input.license.type,
      result: input.license.result,
      note: input.license.note ?? null,
      lookupUrl: NH_LICENSE_LOOKUP.url,
      checkedBy: actor.userId,
      checkedAt: now,
    })
  }
  return ok({ applicationId, number: application.value.number })
}
