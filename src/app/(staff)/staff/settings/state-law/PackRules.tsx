import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { SectionHeader } from '@/components/layout/ListHeader'
import type { RuleSortKey } from '@/features/config/settingsTableView'
import type { SortLink } from '@/features/dataTable/sort'
import { loadPack } from '@/features/packs/loadPack'
import { classificationSummary, type RuleSummary } from '@/features/packs/ruleSummary'
import { ClassificationRules } from './ClassificationRules'

function TownValue({ summary, value }: { summary: RuleSummary; value: number | undefined }) {
  if (value === undefined) return null
  const amount = summary.unit === null ? String(value) : `${String(value)} ${summary.unit}`
  return (
    <p className="mt-1">
      <Link href={`/staff/settings/town_rule_setting/${encodeURIComponent(summary.key)}`}>
        {`Town value: ${amount}`}
      </Link>
    </p>
  )
}

export function PackRules({
  rules,
  links,
  townValues,
}: {
  rules: readonly RuleSummary[]
  links: Record<RuleSortKey, SortLink>
  townValues: ReadonlyMap<string, number>
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
                <td>
                  {summary.policy}
                  <TownValue summary={summary} value={townValues.get(summary.key)} />
                </td>
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
