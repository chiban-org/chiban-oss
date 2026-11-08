import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { type SectionSuggestion, sourcesLabel } from '@/features/enforcement/sections/suggestions'
import { cn } from '@/lib/utils'

export function sectionOptionId(listId: string, index: number): string {
  return `${listId}-option-${String(index)}`
}

function keepFocus(event: MouseEvent) {
  event.preventDefault()
}

export function SectionOptions({
  listId,
  options,
  active,
  onHover,
  onPick,
}: {
  listId: string
  options: readonly SectionSuggestion[]
  active: number
  onHover: (index: number) => void
  onPick: (suggestion: SectionSuggestion) => void
}) {
  return (
    <div onMouseDown={keepFocus}>
      <ul id={listId} role="listbox" aria-label="Matching sections" className="m-0 list-none p-0">
        {options.map((s, index) => (
          <li
            key={s.value}
            id={sectionOptionId(listId, index)}
            role="option"
            aria-selected={index === active}
            className={cn(
              'cursor-pointer rounded-md px-3 py-2',
              index === active ? 'bg-canvas outline outline-1 outline-hairline' : undefined,
            )}
            onMouseMove={() => onHover(index)}
            onClick={() => onPick(s)}
          >
            <span className="block font-semibold">{s.value}</span>
            <span className="block text-sm text-muted-foreground">{sourcesLabel(s)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SectionChips({
  chips,
  onPick,
}: {
  chips: readonly SectionSuggestion[]
  onPick: (suggestion: SectionSuggestion) => void
}) {
  if (chips.length === 0) return null
  return (
    <div role="group" aria-label="Common sections" className="flex flex-wrap gap-2">
      {chips.map((s) => (
        <Button
          key={s.value}
          type="button"
          variant="outline"
          size="sm"
          className="h-auto max-w-full flex-col items-start gap-0 py-1.5 text-left whitespace-normal"
          onClick={() => onPick(s)}
        >
          <span className="font-semibold">{s.value}</span>
          <span className="text-xs font-normal text-muted-foreground">{sourcesLabel(s)}</span>
        </Button>
      ))}
    </div>
  )
}
