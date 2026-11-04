import { StatusChip } from '@/components/StatusChip'
import { choiceTitle, type PickerChoice } from './pickerChoice'

export function ParcelTitle({ choice }: { choice: PickerChoice }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-semibold tabular-nums">{choiceTitle(choice)}</span>
      {choice.kind === 'parcel' && choice.parcel.status === 'retired' ? (
        <StatusChip status="neutral" label="Retired" />
      ) : null}
    </span>
  )
}
