import { Kbd } from '@/components/ui/kbd'

export type KeyHint = { keys: string[]; action: string }

export function KeyHints({ hints }: { hints: KeyHint[] }) {
  return (
    <p
      data-slot="key-hints"
      className="mb-5 hidden flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground md:flex"
    >
      {hints.map((hint) => (
        <span key={hint.action}>
          {hint.keys.map((key) => (
            <span key={key}>
              <Kbd>{key}</Kbd>{' '}
            </span>
          ))}
          {hint.action}
        </span>
      ))}
    </p>
  )
}
