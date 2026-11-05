import type { MouseEvent } from 'react'
import { StatusChip } from '@/components/StatusChip'
import { cn } from '@/lib/utils'
import { type SearchOption, sectionsOf } from './searchOptions'
import type { RecordSearchState } from './useRecordSearch'

interface Props {
  listId: string
  state: RecordSearchState
  options: SearchOption[]
  active: number
  onHover: (index: number) => void
  onPick: (option: SearchOption) => void
}

export function recordOptionId(listId: string, index: number): string {
  return `${listId}-option-${index}`
}

function keepFocus(event: MouseEvent) {
  event.preventDefault()
}

function StatusLine({ state }: { state: RecordSearchState }) {
  if (state.phase === 'failed')
    return <p className="m-0 px-3 py-2 text-sm">Search is not available. Try again.</p>
  if (state.phase === 'loading')
    return <p className="m-0 px-3 py-2 text-sm text-muted-foreground">Searching</p>
  if (state.phase === 'done' && state.result.exact === null && state.result.groups.length === 0)
    return (
      <p className="m-0 px-3 py-2 text-sm">
        Nothing matches. Try a record number, an address or an owner.
      </p>
    )
  return null
}

function OptionBody({ option }: { option: SearchOption }) {
  if (option.seeAll)
    return <span className="text-sm font-semibold text-action">{option.title}</span>
  return (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-semibold tabular-nums">{option.title}</span>
        {option.chip === null ? null : (
          <StatusChip status={option.chip.status} label={option.chip.label} />
        )}
      </span>
      {option.detail === '' ? null : (
        <span className="block truncate text-sm text-muted-foreground">{option.detail}</span>
      )}
    </>
  )
}

export function RecordSearchResults({ listId, state, options, active, onHover, onPick }: Props) {
  const sections = sectionsOf(options)
  return (
    <div onMouseDown={keepFocus}>
      <StatusLine state={state} />
      <div id={listId} role="listbox" aria-label="Matching records">
        {sections.map((section) => (
          <div
            key={section.label}
            role="group"
            aria-label={section.label}
            className="border-t border-hairline py-1 first:border-t-0"
          >
            <p
              aria-hidden={true}
              className="m-0 px-3 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground"
            >
              {section.label}
            </p>
            {section.items.map(({ option, index }) => (
              <div
                key={option.key}
                id={recordOptionId(listId, index)}
                role="option"
                aria-selected={index === active}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1.5',
                  index === active ? 'bg-canvas outline outline-1 outline-hairline' : undefined,
                )}
                onMouseMove={() => onHover(index)}
                onClick={() => onPick(option)}
              >
                <OptionBody option={option} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
