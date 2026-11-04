import type { MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { ParcelTitle } from './ParcelTitle'
import { choiceDetail, type PickerChoice } from './pickerChoice'
import type { SearchState } from './useParcelSearch'

interface ParcelOptionsProps {
  listId: string
  state: SearchState
  options: PickerChoice[]
  active: number
  onHover: (index: number) => void
  onPick: (choice: PickerChoice) => void
}

export function optionId(listId: string, index: number): string {
  return `${listId}-option-${index}`
}

function keepFocus(event: MouseEvent) {
  event.preventDefault()
}

function OptionBody({ choice }: { choice: PickerChoice }) {
  if (choice.kind === 'raw')
    return (
      <>
        <span className="block font-semibold">Use this ID anyway</span>
        <span className="block text-sm text-muted-foreground tabular-nums">{choice.value}</span>
      </>
    )
  return (
    <>
      <ParcelTitle choice={choice} />
      <span className="block text-sm text-muted-foreground">{choiceDetail(choice)}</span>
    </>
  )
}

function StatusLine({ state }: { state: SearchState }) {
  if (state.phase === 'failed')
    return <p className="m-0 px-3 py-2 text-sm">Parcel search is not available. Try again.</p>
  if (state.phase === 'loading')
    return <p className="m-0 px-3 py-2 text-sm text-muted-foreground">Searching</p>
  if (state.phase === 'done' && state.hits.length === 0)
    return <p className="m-0 px-3 py-2 text-sm">No parcel matches</p>
  return null
}

export function ParcelOptions({
  listId,
  state,
  options,
  active,
  onHover,
  onPick,
}: ParcelOptionsProps) {
  return (
    <div onMouseDown={keepFocus}>
      <StatusLine state={state} />
      <ul id={listId} role="listbox" aria-label="Matching parcels" className="m-0 list-none p-0">
        {options.map((choice, index) => (
          <li
            key={choice.kind === 'raw' ? `raw-${choice.value}` : choice.parcel.parcelId}
            id={optionId(listId, index)}
            role="option"
            aria-selected={index === active}
            className={cn(
              'cursor-pointer rounded-md px-3 py-2',
              index === active ? 'bg-canvas outline outline-1 outline-hairline' : undefined,
            )}
            onMouseMove={() => onHover(index)}
            onClick={() => onPick(choice)}
          >
            <OptionBody choice={choice} />
          </li>
        ))}
      </ul>
    </div>
  )
}
