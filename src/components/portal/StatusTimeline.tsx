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

export function StatusTimeline({ state }: { state: CoreState }) {
  const current = position(state)
  const outcome = OUTCOMES[state]
  return (
    <div>
      <ol className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {STEPS.map((step, index) => {
          const done =
            index < current || (index === current && outcome !== undefined && state === 'closed')
          const here = index === current
          return (
            <li key={step} aria-current={here ? 'step' : undefined} className="text-base">
              <span className={here ? 'font-semibold' : ''}>{STATE_LABELS[step]}</span>
              <span className="ml-2 text-muted-foreground">
                {done ? 'Done' : here ? 'Now' : 'Not yet'}
              </span>
            </li>
          )
        })}
      </ol>
      {outcome === undefined ? null : <p className="mt-2 text-base font-medium">{outcome}</p>}
    </div>
  )
}
