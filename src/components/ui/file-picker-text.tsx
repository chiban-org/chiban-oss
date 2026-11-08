import { UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function DropzoneText(props: {
  compact: boolean
  prompt: string
  chooseLabel: string
  hint: string
  disabled: boolean
  onChoose: () => void
}) {
  const quiet = props.compact ? 'sr-only' : undefined
  return (
    <>
      {props.compact ? null : (
        <UploadCloud className="size-7 text-muted-foreground" aria-hidden="true" />
      )}
      <p className={cn('m-0 text-sm text-muted-foreground', quiet)}>{props.prompt}</p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 md:min-h-9"
        tabIndex={-1}
        disabled={props.disabled}
        onClick={props.onChoose}
      >
        {props.chooseLabel}
      </Button>
      {props.hint === '' ? null : (
        <p className={cn('m-0 text-xs text-muted-foreground', quiet)}>{props.hint}</p>
      )}
    </>
  )
}
