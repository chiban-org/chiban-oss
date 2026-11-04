import { CheckField } from '@/components/staff/fields'
import { describePath, describeValue } from '@/features/config/diffText'
import { KIND_LABELS } from '@/features/config/kindLabels'
import type { ConfigKind } from '@/features/config/kinds'
import type { DiffEntry } from '@/features/config/starterDiff'

export interface ReviewMember {
  kind: ConfigKind
  key: string
  label: string
  entries: DiffEntry[]
}

export function StarterDiffReview({ members }: { members: ReviewMember[] }) {
  return (
    <div className="space-y-4">
      {members.map((member) => (
        <fieldset key={`${member.kind}:${member.key}`} className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{`${KIND_LABELS[member.kind]}: ${member.label}`}</legend>
          {member.entries.length === 0 ? <p className="m-0 text-sm">No differences.</p> : null}
          <ul className="m-0 list-none space-y-2 p-0">
            {member.entries.map((entry) => (
              <li key={entry.path}>
                <CheckField
                  className="items-start"
                  name={`path:${member.kind}:${member.key}`}
                  value={entry.path}
                  label={
                    <span>
                      <span>{describePath(entry.path)}</span>
                      <span className="block text-muted-foreground">{`Your town: ${describeValue(entry.path, entry.town)}`}</span>
                      <span className="block text-muted-foreground">{`Upstream: ${describeValue(entry.path, entry.upstream)}`}</span>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  )
}
