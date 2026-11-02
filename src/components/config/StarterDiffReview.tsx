import { KIND_LABELS } from '@/features/config/kindLabels'
import type { ConfigKind } from '@/features/config/kinds'
import type { DiffEntry } from '@/features/config/starterDiff'

export interface ReviewMember {
  kind: ConfigKind
  key: string
  entries: DiffEntry[]
}

function show(value: unknown): string {
  return value === undefined ? 'nothing' : JSON.stringify(value)
}

export function StarterDiffReview({ members }: { members: ReviewMember[] }) {
  return (
    <div className="space-y-4">
      {members.map((member) => (
        <fieldset key={`${member.kind}:${member.key}`} className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{`${KIND_LABELS[member.kind]}: ${member.key}`}</legend>
          {member.entries.length === 0 ? <p className="m-0 text-sm">No differences.</p> : null}
          <ul className="m-0 list-none space-y-2 p-0">
            {member.entries.map((entry) => (
              <li key={entry.path}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`path:${member.kind}:${member.key}`}
                    value={entry.path}
                    className="mt-1"
                  />
                  <span>
                    <code>{entry.path}</code>
                    <span className="block text-muted-foreground">{`Your town: ${show(entry.town)}`}</span>
                    <span className="block text-muted-foreground">{`Upstream: ${show(entry.upstream)}`}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  )
}
