import type { ReactNode } from 'react'
import { StatusChip } from '@/components/StatusChip'
import { type CoreState, STATE_LABELS } from '@/features/applications/states'
import type { GateResult } from '@/features/gates/evaluateGates'
import { gateDetail } from '@/features/gates/gateDetail'

interface GatePanelProps {
  groups: { to: CoreState; results: GateResult[] }[]
  renderControls?: (result: GateResult) => ReactNode
}

function Verdict({ result }: { result: GateResult }) {
  if (result.override !== null) {
    return (
      <StatusChip
        status="overdue"
        label={
          result.override.kind === 'statutory_exception'
            ? 'Statutory exception recorded'
            : 'Overridden'
        }
      />
    )
  }
  return result.effective === 'pass' ? (
    <StatusChip status="passed" label="Clear" />
  ) : (
    <StatusChip status="failed" label="Blocked" />
  )
}

function OverrideNote({ result }: { result: GateResult }) {
  const o = result.override
  if (o === null) return null
  if (o.kind === 'statutory_exception') {
    const authority = o.legalAuthority as { citation: string; explanation: string } | null
    return (
      <p className="text-sm">{`Authority: ${authority?.citation ?? ''}. ${authority?.explanation ?? ''}`}</p>
    )
  }
  return <p className="text-sm">{`Reason: ${o.reason ?? ''}`}</p>
}

function Detail({ result }: { result: GateResult }) {
  if (result.outcome.status === 'pass') return null
  const detail = gateDetail(result.label, result.outcome.reason)
  return detail === '' ? null : <p className="text-sm">{detail}</p>
}

function citationRepeatsLabel(result: GateResult): boolean {
  return result.citation === null || result.label.includes(result.citation.label)
}

export function GatePanel({ groups, renderControls }: GatePanelProps) {
  const shown = groups.filter((group) => group.results.length > 0)
  return (
    <div>
      {shown.length === 0 ? <p>No gates apply to the next step.</p> : null}
      {shown.map((group) => (
        <section key={group.to} aria-label={`Gates for ${STATE_LABELS[group.to]}`} className="my-3">
          <h3>{`Before ${STATE_LABELS[group.to].toLowerCase()}`}</h3>
          <ul className="list-none divide-y p-0">
            {group.results.map((result) => (
              <li key={result.key} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{result.label}</strong>
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {result.kind === 'statutory' ? 'Statutory' : 'Administrative'}
                    </span>
                    <Verdict result={result} />
                  </span>
                </div>
                <Detail result={result} />
                {citationRepeatsLabel(result) ? null : (
                  <p className="text-sm text-muted-foreground">{result.citation?.label}</p>
                )}
                <OverrideNote result={result} />
                {renderControls?.(result)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
