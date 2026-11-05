import { SortHeader } from '@/components/dataTable/SortHeader'
import { SectionHeader } from '@/components/layout/ListHeader'
import type { RuleSortKey } from '@/features/config/settingsTableView'
import type { SortLink } from '@/features/dataTable/sort'
import { loadPack } from '@/features/packs/loadPack'
import { classificationSummary, type RuleSummary } from '@/features/packs/ruleSummary'
import { ClassificationRules } from './ClassificationRules'

export function PackRules({
  rules,
  links,
}: {
  rules: readonly RuleSummary[]
  links: Record<RuleSortKey, SortLink>
}) {
  const pack = loadPack()
  return (
    <>
      <div className="table-panel">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Rules from state law</caption>
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
                    <a href={summary.citation.url}>{summary.citation.label}</a>
                  )}
                </td>
                <td>{summary.policy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section aria-labelledby="by-classification">
        <SectionHeader id="by-classification" title="Required rules by classification" />
        <ClassificationRules
          summaries={pack.classifications.map((c) => classificationSummary(c, pack))}
        />
      </section>
    </>
  )
}
