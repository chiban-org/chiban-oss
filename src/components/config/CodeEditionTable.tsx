import type { CodeEditionEntry } from '@packs/nh/schema'
import { StatusChip } from '@/components/StatusChip'
import { componentsNotInLabel, describeCodeEdition } from '@/features/building/codeEdition'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const EPOCH = '1970-01-01'
const FAR_FUTURE = '9999-12-31' as CivilDate

export function CodeEditionTable({ editions }: { editions: CodeEditionEntry[] }) {
  const ordered = [...editions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th>Edition</th>
          <th>Effective from</th>
          <th>Status</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((entry) => {
          const d = describeCodeEdition(entry, FAR_FUTURE)
          return (
            <tr key={entry.key} className="align-top">
              <td>{humanizeIsoDates(d.label)}</td>
              <td>
                {entry.effectiveFrom === EPOCH
                  ? 'Start of records'
                  : formatCivilDate(entry.effectiveFrom)}
              </td>
              <td>
                <StatusChip
                  status={d.status === 'verified' ? 'passed' : 'neutral'}
                  label={d.status === 'verified' ? 'Verified' : 'Not verified'}
                />
              </td>
              <td>
                {d.status === 'unverified' ? (
                  <p className="m-0">
                    Chiban does not know which codes applied in this period. Applications received
                    then record this edition as not verified.
                  </p>
                ) : null}
                {componentsNotInLabel(d).length === 0 ? null : (
                  <p className="m-0">{componentsNotInLabel(d).join(', ')}</p>
                )}
                {d.enforcementFrom === null ? null : (
                  <p className="m-0">{`Enforced from ${formatCivilDate(d.enforcementFrom)}`}</p>
                )}
                {d.amendmentPackagesInForce.map((label) => (
                  <p key={label} className="m-0">
                    {humanizeIsoDates(label)}
                  </p>
                ))}
                <a href={d.citation.url}>{d.citation.label}</a>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
