import Link from 'next/link'
import { intakeHref } from '@/features/counter/intake/intakeHref'
import { isDraftStep, type StepLink, type TakeStep } from '@/features/counter/intake/intakeSteps'
import { cn } from '@/lib/utils'

export function IntakeStepNav({
  applicationId,
  steps,
  current,
  draft,
}: {
  applicationId: string
  steps: readonly StepLink[]
  current: TakeStep
  draft: boolean
}) {
  return (
    <nav aria-label="Steps">
      <ol className="flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {steps.map((step, index) => {
          const isCurrent = step.key === current
          const label = `Step ${index + 1}: ${step.label}`
          const linkable = draft && !isCurrent && isDraftStep(step.key)
          return (
            <li key={step.key} className={cn(isCurrent && 'font-semibold text-ink')}>
              {linkable && isDraftStep(step.key) ? (
                <Link href={intakeHref(applicationId, step.key)}>{label}</Link>
              ) : (
                <span aria-current={isCurrent ? 'step' : undefined}>{label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
