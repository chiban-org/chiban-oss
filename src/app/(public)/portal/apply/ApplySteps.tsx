const STEPS = ['Find the property', 'Choose the kind of application', 'Fill in and submit'] as const

export function ApplySteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Steps">
      <p className="m-0 font-semibold text-ink-secondary">{`Step ${current} of ${STEPS.length}`}</p>
      <ol className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0">
        {STEPS.map((step, index) => {
          const here = index + 1 === current
          return (
            <li
              key={step}
              aria-current={here ? 'step' : undefined}
              className={here ? 'font-semibold text-ink' : 'text-muted-foreground'}
            >
              {`${index + 1}. ${step}`}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
