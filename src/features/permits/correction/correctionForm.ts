import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { projects } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { LICENSE_FIELD } from '@/features/forms/formReferences'
import type { FormBody } from '@/features/forms/formSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'
import { activeParties, currentContractor } from '@/features/permits/correction/contractor'
import { isCorrectablePermit, mayCorrectPermits } from '@/features/permits/correction/policy'

export interface CorrectionFormData {
  applicationId: string
  number: string
  nextRevision: number
  form: FormBody
  values: Record<string, FieldValue>
  licenseField: { label: string; required: boolean } | null
  projectTitle: string
  contractor: { id: string; name: string } | null
  otherParties: { id: string; label: string }[]
  amendedHref: string | null
}

const ROLE_LABELS = {
  owner: 'owner',
  agent: 'agent',
  contractor: 'contractor',
  applicant: 'applicant',
} as const

function answersOnly(form: FormBody): FormBody {
  return {
    ...form,
    fields: form.fields.filter((f) => f.staffOnly !== true && f.key !== LICENSE_FIELD),
  }
}

function licenseFieldOf(form: FormBody): CorrectionFormData['licenseField'] {
  const field = form.fields.find((f) => f.key === LICENSE_FIELD)
  return field === undefined ? null : { label: field.label, required: field.required }
}

export async function loadCorrectionForm(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<CorrectionFormData | null> {
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null || !isCorrectablePermit(app)) return null
  if (!(await mayCorrectPermits(db, actor, signal))) return null
  const form = (await getVersion(db, app.pins.form, signal))?.body as FormBody
  const [project] = await db.select().from(projects).where(eq(projects.id, app.projectId))
  const parties = await activeParties(db, app.projectId)
  const contractor = currentContractor(parties)
  const staffOnly = new Set(form.fields.filter((f) => f.staffOnly === true).map((f) => f.key))
  return {
    applicationId,
    number: app.number,
    nextRevision: app.permitRevision + 1,
    form: answersOnly(form),
    values: Object.fromEntries(Object.entries(app.values).filter(([k]) => !staffOnly.has(k))),
    licenseField: licenseFieldOf(form),
    projectTitle: project?.title ?? '',
    contractor: contractor === null ? null : { id: contractor.id, name: contractor.name },
    otherParties: parties
      .filter((p) => p.id !== contractor?.id)
      .map((p) => ({ id: p.id, label: `${p.name} (${ROLE_LABELS[p.role]})` })),
    amendedHref: app.typeBody.workflow.allowsDirectIssue
      ? `/staff/counter?parcel=${project?.parcelId ?? ''}&type=${encodeURIComponent(app.typeBody.key)}`
      : null,
  }
}
