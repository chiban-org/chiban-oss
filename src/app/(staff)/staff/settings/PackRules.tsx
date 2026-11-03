import { SortHeader } from '@/components/dataTable/SortHeader'
import type { RuleSortKey } from '@/features/config/settingsTableView'
import type { SortLink } from '@/features/dataTable/sort'
import { loadPack } from '@/features/packs/loadPack'
import { classificationSummary, type RuleSummary } from '@/features/packs/ruleSummary'

export function PackRules({
  rules,
  links,
  open,
}: {
  rules: readonly RuleSummary[]
  links: Record<RuleSortKey, SortLink>
  open: boolean
}) {
  const pack = loadPack()
  return (
    <>
      <details className="my-3" open={open}>
        <summary className="cursor-pointer">Rules from state law</summary>
        <div className="table-panel my-3">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr>
                <SortHeader label="Rule" link={links.rule} />
                <SortHeader label="Citation" link={links.citation} />
                <SortHeader label="What the town can change" link={links.policy} />
              </tr>
            </thead>
            <tbody>
              {rules.map((summary) => (
                <tr key={`${summary.key}-${summary.version}`} className="align-top">
                  <td>{summary.label}</td>
                  <td>
                    {summary.citation.url === null ? (
                      summary.citation.label
                    ) : (
                      <a href={summary.citation.url} className="text-action underline">
                        {summary.citation.label}
                      </a>
                    )}
                  </td>
                  <td>{summary.policy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="my-3">
        <summary className="cursor-pointer">Required rules by classification</summary>
        <ul className="mt-2">
          {pack.classifications.map((c) => {
            const summary = classificationSummary(c, pack)
            return <li key={summary.key}>{`${summary.label}: ${summary.mandatory.join('; ')}`}</li>
          })}
        </ul>
      </details>
    </>
  )
}
