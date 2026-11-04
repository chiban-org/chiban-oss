import { ParcelTitle } from './ParcelTitle'
import { choiceDetail, type PickerChoice } from './pickerChoice'

interface ChosenParcelProps {
  choice: PickerChoice
  actionLabel: string
  actionAriaLabel: string
  onAction: () => void
}

export function ChosenParcel({
  choice,
  actionLabel,
  actionAriaLabel,
  onAction,
}: ChosenParcelProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-hairline bg-surface px-3 py-2">
      <div className="min-w-0">
        <ParcelTitle choice={choice} />
        <p className="m-0 text-sm text-muted-foreground">{choiceDetail(choice)}</p>
      </div>
      <button
        type="button"
        className="shrink-0 cursor-pointer text-sm text-action underline underline-offset-2"
        aria-label={actionAriaLabel}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  )
}
