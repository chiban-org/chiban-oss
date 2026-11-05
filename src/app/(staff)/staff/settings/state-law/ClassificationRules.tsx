export interface ClassificationSummary {
  key: string
  label: string
  mandatory: readonly string[]
}

function ruleCount(n: number): string {
  return `${n} required ${n === 1 ? 'rule' : 'rules'}`
}

function Row({ summary }: { summary: ClassificationSummary }) {
  const nameId = `classification-${summary.key}`
  const name = (
    <span id={nameId} className="font-semibold text-ink">
      {summary.label}
    </span>
  )
  return (
    <li aria-labelledby={nameId} className="record-item pb-3">
      {summary.mandatory.length === 0 ? (
        <p className="m-0 flex flex-wrap items-baseline gap-x-3">
          {name}
          <span className="text-sm text-muted-foreground">No required rules</span>
        </p>
      ) : (
        <details>
          <summary className="font-normal">
            {name}
            <span className="ml-3 text-sm text-muted-foreground">
              {ruleCount(summary.mandatory.length)}
            </span>
          </summary>
          <ul className="m-0 grid list-disc gap-1 pl-5 text-sm">
            {summary.mandatory.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

export function ClassificationRules({
  summaries,
}: {
  summaries: readonly ClassificationSummary[]
}) {
  return (
    <ul className="list-none p-0">
      {summaries.map((summary) => (
        <Row key={summary.key} summary={summary} />
      ))}
    </ul>
  )
}
