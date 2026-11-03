import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import {
  APPEAL_OUTCOME_LABELS,
  APPEAL_TARGET_LABELS,
  PERIL_LABELS,
} from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import {
  appealAction,
  certifyPerilAction,
  dissolveRestrainingOrderAction,
  resolveAppealAction,
  restrainingOrderAction,
} from '../appealActions'
import type { Can } from './can'
import { Hidden, Section } from './Section'

const OUTCOMES = Object.entries(APPEAL_OUTCOME_LABELS) as [string, string][]
const PERILS = Object.entries(PERIL_LABELS) as [string, string][]

export function AppealsSection({ detail, can }: { detail: CaseDetail; can: Can }) {
  const caseId = detail.staff.row.id
  const targets: [string, string][] = [
    ...detail.orders
      .filter((o) => o.row.status !== 'draft')
      .map((o) => [`order:${o.row.id}`, `Order ${o.row.number}`] as [string, string]),
    ...detail.notices.map(
      (n) =>
        [`notice:${n.id}`, `Notice of violation sent ${formatCivilDate(n.sentOn)}`] as [
          string,
          string,
        ],
    ),
  ]
  const courtDocs: [string, string][] = detail.documents
    .filter((d) => d.docKind === 'court_document')
    .map((d) => [d.documentId, d.title])
  return (
    <Section id="appeals" title="Appeals to the zoning board of adjustment">
      {detail.appeals.length === 0 ? <p>No appeal has been filed.</p> : null}
      {detail.appeals.map((a) => (
        <article key={a.row.id} className="record-item space-y-2">
          <p className="m-0 font-medium">
            {`${APPEAL_TARGET_LABELS[a.row.targetKind]} appealed by ${a.row.appellantName} on ${formatCivilDate(a.row.filedOn)}. `}
            {a.row.resolvedOn === null
              ? 'Not yet decided.'
              : `${a.row.outcome === null ? 'Resolved' : APPEAL_OUTCOME_LABELS[a.row.outcome]} on ${formatCivilDate(a.row.resolvedOn)}.`}
          </p>
          {a.certification === null ? null : (
            <p className="m-0">{`Imminent peril certified ${formatCivilDate(a.certification.certifiedOn)} (${a.certification.categories.map((c) => PERIL_LABELS[c as keyof typeof PERIL_LABELS]).join(', ')}): ${a.certification.statement}`}</p>
          )}
          {a.restraints.map((r) => (
            <p key={r.id} className="m-0">
              {`Restraining order from ${r.issuedBy === 'zba' ? 'the ZBA' : 'the superior court'}, issued ${formatCivilDate(r.issuedOn)}${r.dissolvedOn === null ? '' : `, dissolved ${formatCivilDate(r.dissolvedOn)}`}. `}
              {r.dissolvedOn === null && can.service ? (
                <ActionForm action={dissolveRestrainingOrderAction} submitLabel="Mark dissolved">
                  <Hidden name="restrainingOrderId" value={r.id} />
                  <TextField
                    label="Date dissolved"
                    name="dissolvedOn"
                    type="date"
                    defaultValue={detail.today}
                    required
                  />
                </ActionForm>
              ) : null}
            </p>
          ))}
          {a.row.resolvedOn === null && can.service ? (
            <div className="space-y-2">
              <ActionForm action={resolveAppealAction} submitLabel="Record decision">
                <Hidden name="appealId" value={a.row.id} />
                <SelectField label="Decision" name="outcome" options={OUTCOMES} />
                <TextField
                  label="Date decided"
                  name="resolvedOn"
                  type="date"
                  defaultValue={detail.today}
                  required
                />
              </ActionForm>
              {a.certification === null && can.issue ? (
                <details>
                  <summary className="cursor-pointer font-medium">Certify imminent peril</summary>
                  <ActionForm action={certifyPerilAction} submitLabel="Certify">
                    <Hidden name="appealId" value={a.row.id} />
                    <SelectField label="What is at risk" name="category" options={PERILS} />
                    <AreaField label="Statement" name="statement" rows={3} required />
                    <TextField
                      label="Date"
                      name="certifiedOn"
                      type="date"
                      defaultValue={detail.today}
                      required
                    />
                  </ActionForm>
                </details>
              ) : null}
              <details>
                <summary className="cursor-pointer font-medium">Record a restraining order</summary>
                <ActionForm action={restrainingOrderAction} submitLabel="Record restraining order">
                  <Hidden name="appealId" value={a.row.id} />
                  <SelectField
                    label="Issued by"
                    name="issuedBy"
                    options={[
                      ['zba', 'The ZBA'],
                      ['superior_court', 'The superior court'],
                    ]}
                  />
                  <TextField
                    label="Date issued"
                    name="issuedOn"
                    type="date"
                    defaultValue={detail.today}
                    required
                  />
                  <SelectField label="Court document" name="documentId" options={courtDocs} />
                </ActionForm>
              </details>
            </div>
          ) : null}
        </article>
      ))}
      {can.service && targets.length > 0 ? (
        <details>
          <summary className="cursor-pointer font-medium">Record an appeal</summary>
          <ActionForm action={appealAction} submitLabel="Record appeal">
            <Hidden name="caseId" value={caseId} />
            <SelectField label="What is appealed" name="target" options={targets} />
            <TextField label="Appellant" name="appellantName" required />
            <TextField
              label="Date filed"
              name="filedOn"
              type="date"
              defaultValue={detail.today}
              required
            />
          </ActionForm>
        </details>
      ) : null}
    </Section>
  )
}
