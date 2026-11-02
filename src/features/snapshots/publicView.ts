import type { PartyRole } from '@/features/access/roles'
import type { ConfigPins } from '@/features/config/bindings'
import type { FormBody } from '@/features/forms/formSchema'
import type { FieldValue, ProjectFacts } from '@/features/forms/validateSubmission'
import type { CivilDate } from '@/types/civilDate'

export interface SnapshotParty {
  role: PartyRole
  name: string
  email: string | null
}

export interface ApplicationSnapshotBody {
  applicationNumber: string
  applicationTypeKey: string
  configPins: ConfigPins
  form: FormBody
  values: Record<string, FieldValue>
  facts: ProjectFacts
  parties: SnapshotParty[]
  attestation: { userId: string; statementSha256: string; attestedAt: string } | null
  attachments: { documentId: string; versionId: string; sha256: string; filename: string }[]
  receivedDate: CivilDate | null
  capturedAt: string
}

export interface PublicSnapshotView
  extends Omit<ApplicationSnapshotBody, 'parties' | 'attestation'> {
  parties: { role: PartyRole; name: string }[]
}

const CONTACT_TYPES: readonly string[] = ['email', 'phone']

export function publicSnapshotView(body: ApplicationSnapshotBody): PublicSnapshotView {
  const contactKeys = new Set(
    body.form.fields.filter((f) => CONTACT_TYPES.includes(f.type)).map((f) => f.key),
  )
  const { attestation: _attestation, parties, ...rest } = body
  return {
    ...rest,
    form: { ...body.form, fields: body.form.fields.filter((f) => !contactKeys.has(f.key)) },
    values: Object.fromEntries(Object.entries(body.values).filter(([k]) => !contactKeys.has(k))),
    parties: parties.map((p) => ({ role: p.role, name: p.name })),
  }
}
