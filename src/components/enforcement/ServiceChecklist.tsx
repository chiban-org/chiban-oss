import type { CeaseAndDesistRule, RecipientRole } from '@packs/nh/schema'
import { NEW_TAB } from '@/components/newTab'
import {
  ROLE_CHECK_LABELS,
  ROLE_LABELS,
  SERVER_ROLE_LABELS,
  SERVICE_METHOD_LABELS,
} from '@/features/enforcement/labels'
import type { ServiceState } from '@/features/enforcement/service'
import { coveredByOwner, type ServiceStatus } from '@/features/enforcement/serviceStatus'
import { formatCivilDate } from '@/lib/formatDate'

const MISSING = 'rounded-md bg-highlight px-2 py-1 font-semibold'

function Missing({ children }: { children: string }) {
  return <span className={MISSING}>{children}</span>
}

interface RoleProps {
  rule: CeaseAndDesistRule
  role: RecipientRole
  status: ServiceStatus
  state: ServiceState
}

function Listed({ role, status, state }: Omit<RoleProps, 'rule'>) {
  const listed = state.recipients.filter((r) => r.role === role)
  if (listed.length === 0) return null
  return (
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
  )
}

function RoleState({ rule, role, status, state }: RoleProps) {
  const check = state.checks.find((c) => c.role === role)
  const listed = state.recipients.some((r) => r.role === role)
  const gap = status.missing.find((m) => m.role === role)
  if (gap?.reason === 'no_check') {
    return (
      <p>
        <Missing>Not yet checked</Missing>
      </p>
    )
  }
  if (check === undefined && !listed && coveredByOwner(rule, role)) {
    return <p>Covered by service on the owner of record.</p>
  }
  return (
    <>
      {check === undefined ? null : <p>{ROLE_CHECK_LABELS[check.outcome]}</p>}
      <Listed role={role} status={status} state={state} />
      {role === 'record_owner' && status.fallbackCompletedOn !== null && !listed ? (
        <p>
          <Missing>
            List the owner of record by name, with the address as unknown, so the answer period can
            start.
          </Missing>
        </p>
      ) : null}
      {gap?.reason === 'publication_incomplete' ? (
        <p>
          <Missing>Posting and publication not complete</Missing>
        </p>
      ) : null}
    </>
  )
}

function RoleRow(props: RoleProps) {
  return (
    <li className="record-item space-y-1">
      <p className="font-medium">{ROLE_LABELS[props.role]}</p>
      <RoleState {...props} />
    </li>
  )
}

function ServiceEvents({ state }: { state: ServiceState }) {
  if (state.events.length === 0) return null
  return (
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
      <p className="font-medium">
        {status.complete ? 'Service is complete.' : 'Service is not complete.'}
      </p>
      <ul className="list-none p-0">
        {rule.recipientRoles.map((role) => (
          <RoleRow key={role} rule={rule} role={role} status={status} state={state} />
        ))}
      </ul>
      {status.fallbackCompletedOn === null ? null : (
        <p>{`Posting and publication complete ${formatCivilDate(status.fallbackCompletedOn)}.`}</p>
      )}
      <ServiceEvents state={state} />
    </div>
  )
}
