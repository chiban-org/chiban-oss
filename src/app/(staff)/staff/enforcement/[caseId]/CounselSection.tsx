import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { COUNSEL_OUTCOME_LABELS, COUNSEL_PURPOSE_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { outcomeAction, referAction } from '../moneyActions'
import type { Can } from './can'
import { Hidden, Section } from './Section'

const PURPOSES = Object.entries(COUNSEL_PURPOSE_LABELS) as [string, string][]
const OUTCOMES = Object.entries(COUNSEL_OUTCOME_LABELS) as [string, string][]

export function CounselSection({ detail, can }: { detail: CaseDetail; can: Can }) {
  const courtDocs: [string, string][] = [
    ['', 'No document'],
    ...detail.documents
      .filter((d) => d.docKind === 'court_document')
      .map((d) => [d.documentId, d.title] as [string, string]),
  ]
  return (
    <Section id="counsel" title="Town counsel">
      {detail.referrals.length === 0 ? <p>This case has not been referred to counsel.</p> : null}
      {detail.referrals.map((r) => (
        <article key={r.row.id} className="record-item space-y-2">
          <p className="m-0 font-medium">
            {`Referred to ${r.row.counselName} on ${formatCivilDate(r.row.referredOn)} for ${COUNSEL_PURPOSE_LABELS[r.row.purpose].toLowerCase()}. `}
            <a {...NEW_TAB} href={`/api/documents/${r.row.packetDocumentId}`}>
              Open packet
            </a>
          </p>
          <ul className="m-0 list-none space-y-1 p-0">
            {r.outcomes.map((o) => (
              <li
                key={o.id}
              >{`${formatCivilDate(o.occurredOn)}: ${COUNSEL_OUTCOME_LABELS[o.kind]}${o.court === null ? '' : `, ${o.court}`}${o.docket === null ? '' : `, docket ${o.docket}`}${o.note === null ? '' : `. ${o.note}`}`}</li>
            ))}
          </ul>
          {can.counsel ? (
            <details>
              <summary className="cursor-pointer font-medium">Record an outcome</summary>
              <ActionForm action={outcomeAction} submitLabel="Record outcome">
                <Hidden name="referralId" value={r.row.id} />
                <SelectField label="What happened" name="kind" options={OUTCOMES} />
                <TextField
                  label="Date"
                  name="occurredOn"
                  type="date"
                  defaultValue={detail.today}
                  required
                />
                <TextField label="Court" name="court" />
                <TextField label="Docket number" name="docket" />
                <SelectField label="Document" name="documentId" options={courtDocs} />
                <AreaField label="Note" name="note" rows={2} />
              </ActionForm>
            </details>
          ) : null}
        </article>
      ))}
      {can.counsel ? (
        <details>
          <summary>Refer to counsel</summary>
          <ActionForm action={referAction} submitLabel="Refer to counsel">
            <Hidden name="caseId" value={detail.staff.row.id} />
            <TextField label="Counsel" name="counselName" required />
            <SelectField label="Purpose" name="purpose" options={PURPOSES} />
            <TextField
              label="Date referred"
              name="referredOn"
              type="date"
              defaultValue={detail.today}
              required
            />
            <p className="m-0">
              The packet lists the findings, orders, service with proof, answer dates, court steps,
              appeals, and the estimated penalty exposure.
            </p>
          </ActionForm>
        </details>
      ) : null}
    </Section>
  )
}
