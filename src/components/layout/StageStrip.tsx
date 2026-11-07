import { Circle, CircleCheck, CircleDot, Clock } from 'lucide-react'

export interface Stage {
  key: string
  label: string
  status: 'done' | 'current' | 'upcoming'
  overdue: boolean
}

const STATUS_TEXT: Record<Stage['status'], string> = {
  done: 'done',
  current: 'current stage',
  upcoming: 'not reached',
}

function StageIcon({ stage }: { stage: Stage }) {
  if (stage.status === 'done') {
    return <CircleCheck className="size-4 shrink-0 text-status-passed-fg" aria-hidden={true} />
  }
  if (stage.status === 'current') {
    return stage.overdue ? (
      <Clock className="size-4 shrink-0 text-status-overdue-fg" aria-hidden={true} />
    ) : (
      <CircleDot className="size-4 shrink-0 text-action" aria-hidden={true} />
    )
  }
  return <Circle className="size-4 shrink-0 text-control-border" aria-hidden={true} />
}

function stageClass(stage: Stage): string {
  if (stage.status === 'upcoming') return 'text-muted-foreground'
  if (stage.status === 'done') return 'text-ink-secondary'
  return stage.overdue ? 'font-semibold text-status-overdue-fg' : 'font-semibold text-ink'
}

export function StageStrip({ stages }: { stages: Stage[] }) {
  return (
    <ol
      aria-label="Progress"
      className="stage-strip m-0 flex list-none flex-wrap items-center gap-y-2 p-0 text-sm"
    >
      {stages.map((stage) => (
        <li
          key={stage.key}
          aria-current={stage.status === 'current' ? 'step' : undefined}
          data-status={stage.status}
          className={`flex items-center gap-1.5 ${stageClass(stage)}`}
        >
          <StageIcon stage={stage} />
          <span>{stage.label}</span>
          {stage.overdue ? <span>(overdue)</span> : null}
          <span className="sr-only">{`, ${STATUS_TEXT[stage.status]}`}</span>
        </li>
      ))}
    </ol>
  )
}
