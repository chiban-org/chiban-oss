import Link from 'next/link'
import { Button } from '@/components/ui/button'

export interface ChosenStep {
  label: string
  value: string
  changeHref: string
}

export function ChosenSteps({ steps }: { steps: readonly ChosenStep[] }) {
  return (
    <section aria-label="Chosen so far">
      <ul>
        {steps.map((step) => (
          <li
            key={step.label}
            className="record-item grid grid-cols-[1fr_auto] items-baseline gap-x-6"
          >
            <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="text-sm font-semibold text-muted-foreground sm:w-28">
                {step.label}
              </span>
              <strong className="text-ink">{step.value}</strong>
            </span>
            <Link href={step.changeHref} aria-label={`Change ${step.label.toLowerCase()}`}>
              Change
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TypeTiles({
  types,
  hrefFor,
}: {
  types: readonly { key: string; label: string }[]
  hrefFor: (typeKey: string) => string
}) {
  return (
    <section aria-labelledby="permit-type">
      <h2 id="permit-type">Permit type</h2>
      {types.length === 0 ? (
        <p>No permit type is set up for counter issue.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => (
            <li key={t.key}>
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-11 w-full justify-start font-normal whitespace-normal no-underline hover:border-action"
              >
                <Link href={hrefFor(t.key)}>{t.label}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
