'use client'

import type { FieldErrors } from '@/components/config/primitives'
import { isChanged } from '@/features/notifications/wording/wordingEdits'
import {
  WORDING_KEY_INFO,
  WORDING_KEYS,
  type WordingAudience,
  type WordingKey,
} from '@/features/notifications/wording/wordingKeys'
import type { NotificationWordingBody } from '@/features/notifications/wording/wordingSchema'
import { cn } from '@/lib/utils'

const AUDIENCES: readonly [WordingAudience, string][] = [
  ['applicants', 'To applicants and contractors'],
  ['staff', 'To staff'],
  ['reviewers', 'To reviewers'],
  ['boards', 'To boards'],
]

interface Props {
  body: NotificationWordingBody
  selected: WordingKey
  onSelect: (key: WordingKey) => void
  errors: FieldErrors
}

function hasError(errors: FieldErrors, key: WordingKey): boolean {
  return Object.keys(errors).some((path) => path.startsWith(`events.${key}.`))
}

export function WordingMessageList({ body, selected, onSelect, errors }: Props) {
  const info = new Map(Object.entries(WORDING_KEY_INFO))
  return (
    <nav aria-label="Messages" className="flex flex-col gap-4">
      {AUDIENCES.map(([audience, heading]) => (
        <div key={audience}>
          <h3 className="m-0 mb-1 font-sans text-sm font-semibold text-muted-foreground">
            {heading}
          </h3>
          <ul className="m-0 list-none p-0">
            {WORDING_KEYS.filter((k) => info.get(k)?.audience === audience).map((key) => (
              <li key={key}>
                <button
                  type="button"
                  aria-current={key === selected ? 'true' : undefined}
                  onClick={() => onSelect(key)}
                  className={cn(
                    'tap-target flex w-full items-baseline justify-between gap-2 rounded-sm px-2 py-1 text-left text-ink hover:bg-canvas',
                    key === selected && 'bg-canvas font-semibold',
                  )}
                >
                  <span>{info.get(key)?.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {hasError(errors, key) ? 'Check' : isChanged(body, key) ? 'Changed' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
