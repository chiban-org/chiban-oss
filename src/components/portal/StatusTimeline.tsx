import type { CoreState } from '@/features/applications/states'
import { STATE_LABELS } from '@/features/applications/states'

const STEPS: CoreState[] = ['draft', 'submitted', 'under_review', 'decided', 'issued']
const OUTCOMES: Partial<Record<CoreState, string>> = {
  denied: 'This application was denied.',
  withdrawn: 'This application was withdrawn.',
  expired: 'This permit has expired.',
  suspended: 'This permit is suspended while an appeal is decided.',
  closed: 'This permit is closed.',
}

function position(state: CoreState): number {
  const index = STEPS.indexOf(state)
  if (index >= 0) return index
  return state === 'closed' || state === 'suspended' || state === 'expired' ? STEPS.length - 1 : 1
}

function dotClass(done: boolean, here: boolean): string {
  const base = 'size-4 shrink-0 rounded-full border-2'
  if (done) return `${base} border-action bg-action`
  if (here) return `${base} border-action bg-surface ring-4 ring-action/20`
  return `${base} border-control-border bg-surface`
}

export function StatusTimeline({ state }: { state: CoreState }) {
  const current = position(state)
  const outcome = OUTCOMES[state]
  return (
    <div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0 sm:grid sm:grid-cols-5 sm:gap-0">
        {STEPS.map((step, index) => {
          const done =
            index < current || (index === current && outcome !== undefined && state === 'closed')
          const here = index === current
          return (
            <li
              key={step}
              aria-current={here ? 'step' : undefined}
              className="relative flex items-center gap-3 text-base sm:flex-col sm:items-start sm:gap-2 sm:pr-2"
            >
              <span className="flex items-center sm:w-full" aria-hidden="true">
                <span className={dotClass(done, here)} />
                {index === STEPS.length - 1 ? null : (
                  <span
                    className={`hidden h-0.5 flex-1 sm:block ${done ? 'bg-action' : 'bg-hairline'}`}
                  />
                )}
              </span>
              <span className={here ? 'font-semibold text-ink' : 'text-ink-secondary'}>
                {STATE_LABELS[step]}
              </span>
              <span className="text-muted-foreground sm:-mt-2">
                {done ? 'Done' : here ? 'Now' : 'Not yet'}
              </span>
            </li>
          )
        })}
      </ol>
      {outcome === undefined ? null : <p className="mt-4 text-base font-semibold">{outcome}</p>}
    </div>
  )
}
