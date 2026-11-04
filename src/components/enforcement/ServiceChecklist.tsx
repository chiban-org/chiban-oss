import type { CeaseAndDesistRule } from '@packs/nh/schema'
import { NEW_TAB } from '@/components/newTab'
import {
  ROLE_CHECK_LABELS,
  ROLE_LABELS,
  SERVER_ROLE_LABELS,
  SERVICE_METHOD_LABELS,
} from '@/features/enforcement/labels'
import type { ServiceState } from '@/features/enforcement/service'
import type { ServiceStatus } from '@/features/enforcement/serviceStatus'
import { formatCivilDate } from '@/lib/formatDate'

const MISSING = 'rounded-md bg-highlight px-2 py-1 font-semibold'

function Missing({ children }: { children: string }) {
  return <span className={MISSING}>{children}</span>
}

function RoleRow({
  role,
  status,
  state,
}: {
  role: CeaseAndDesistRule['recipientRoles'][number]
  status: ServiceStatus
  state: ServiceState
}) {
  const check = state.checks.find((c) => c.role === role)
  const listed = state.recipients.filter((r) => r.role === role)
  const gap = status.missing.find((m) => m.role === role)
  return (
    <li className="space-y-1 rounded-md border p-3">
      <p className="m-0 font-medium">{ROLE_LABELS[role]}</p>
      {check === undefined && listed.length === 0 ? (
        <p className="m-0">
          <Missing>Not yet checked</Missing>
        </p>
      ) : null}
      {check === undefined ? null : <p className="m-0">{ROLE_CHECK_LABELS[check.outcome]}</p>}
      {listed.length === 0 ? null : (
        <ul className="m-0 list-none space-y-1 p-0">
          {listed.map((r) => {
            const servedOn = status.servedOn[r.id]
            return (
              <li key={r.id}>
                {`${r.name}, ${r.address}. Source: ${r.source}. `}
                {servedOn === undefined ? (
                  <Missing>Not served</Missing>
                ) : (
                  `Served ${formatCivilDate(servedOn)}.`
                )}
              </li>
            )
          })}
        </ul>
      )}
      {role === 'record_owner' && status.fallbackCompletedOn !== null && listed.length === 0 ? (
        <p className="m-0">
          <Missing>
            List the owner of record by name, with the address as unknown, so the answer period can
            start.
          </Missing>
        </p>
      ) : null}
      {gap?.reason === 'publication_incomplete' ? (
        <p className="m-0">
          <Missing>Posting and publication not complete</Missing>
        </p>
      ) : null}
    </li>
  )
}

export function ServiceChecklist({
  rule,
  status,
  state,
}: {
  rule: CeaseAndDesistRule
  status: ServiceStatus
  state: ServiceState
}) {
  return (
    <div className="space-y-3">
      <p className="m-0 font-medium">
        {status.complete ? 'Service is complete.' : 'Service is not complete.'}
      </p>
      <ul className="m-0 list-none space-y-2 p-0">
        {rule.recipientRoles.map((role) => (
          <RoleRow key={role} role={role} status={status} state={state} />
        ))}
      </ul>
      {status.fallbackCompletedOn === null ? null : (
        <p className="m-0">{`Posting and publication complete ${formatCivilDate(status.fallbackCompletedOn)}.`}</p>
      )}
      {state.events.length === 0 ? null : (
        <div>
          <p className="m-0 font-medium">Service events</p>
          <ul className="m-0 list-none space-y-1 p-0">
            {state.events.map((e) => (
              <li key={e.id}>
                {`${formatCivilDate(e.servedOn)}: ${SERVICE_METHOD_LABELS[e.method]}`}
                {e.recipientId === null
                  ? ''
                  : ` to ${state.recipients.find((r) => r.id === e.recipientId)?.name ?? 'recipient'}`}
                {e.row.serverName === null
                  ? ''
                  : `, by ${e.row.serverName}${e.row.serverRole === null ? '' : ` (${SERVER_ROLE_LABELS[e.row.serverRole]})`}`}
                {e.row.newspaper === null ? '' : `, ${e.row.newspaper}`}
                {'. '}
                <a {...NEW_TAB} href={`/api/documents/${e.row.proofDocumentId}`}>
                  Proof of service
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
