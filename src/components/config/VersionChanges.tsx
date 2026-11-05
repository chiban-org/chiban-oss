import { InlineDiff } from '@/components/config/TextDiff'
import type { FieldChange } from '@/features/config/versionChanges'

function ChangeValues({ change }: { change: FieldChange }) {
  if (change.inline) return <InlineDiff before={change.before} after={change.after} />
  return (
    <p className="m-0 text-sm break-words">
      <del className="rounded-sm bg-status-failed-bg px-0.5 text-status-failed-fg">
        {change.before}
      </del>
      <span aria-hidden="true">{' → '}</span>
      <ins className="rounded-sm bg-status-passed-bg px-0.5 text-status-passed-fg no-underline">
        {change.after}
      </ins>
    </p>
  )
}

export function VersionChanges({
  version,
  changes,
}: {
  version: number
  changes: { from: number; items: FieldChange[] }
}) {
  return (
    <details>
      <summary>{`What changed in version ${version}`}</summary>
      <div role="group" aria-label={`Changes from version ${changes.from}`} className="mt-2">
        {changes.items.length === 0 ? (
          <p className="m-0 text-sm">No fields changed.</p>
        ) : (
          <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-sm md:grid-cols-[14rem_1fr]">
            {changes.items.map((change) => (
              <div key={change.path} className="contents">
                <dt className="font-medium">{change.label}</dt>
                <dd className="m-0 min-w-0">
                  <ChangeValues change={change} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  )
}
