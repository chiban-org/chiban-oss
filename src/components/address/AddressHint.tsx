'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type AddressSuggestion, toSingleLine } from '@/features/address/suggestionLayout'
import { cn } from '@/lib/utils'

interface Props {
  suggestion: AddressSuggestion | null
  onUse: (suggestion: AddressSuggestion) => void
  tapTarget?: boolean
}

function Body({ suggestion, onUse, tapTarget }: Props & { suggestion: AddressSuggestion }) {
  if (suggestion.matches) {
    return (
      <p
        className={cn(
          'm-0 flex items-center gap-1 text-sm text-muted-foreground',
          tapTarget && 'text-base',
        )}
      >
        <Check aria-hidden="true" className="size-3.5" />
        Matches the USPS address
      </p>
    )
  }
  return (
    <p className={cn('m-0 text-sm text-muted-foreground', tapTarget && 'text-base')}>
      {'USPS suggests: '}
      <span className="text-ink">{toSingleLine(suggestion.lines)}</span>{' '}
      <Button
        type="button"
        variant="link"
        size="xs"
        className={cn(
          'h-auto px-1 py-0 text-sm text-action underline',
          tapTarget && 'min-h-11 text-base',
        )}
        onClick={() => onUse(suggestion)}
      >
        Use this
      </Button>
    </p>
  )
}

export function AddressHint({ suggestion, onUse, tapTarget }: Props) {
  return (
    <div aria-live="polite" data-slot="address-hint">
      {suggestion === null ? null : (
        <Body suggestion={suggestion} onUse={onUse} tapTarget={tapTarget} />
      )}
    </div>
  )
}
