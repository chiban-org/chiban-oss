import { Button } from '@/components/ui/button'

const NUDGE = 12

type Change = (dx: number, dy: number) => void

const MOVES: [string, number, number][] = [
  ['Move left', -NUDGE, 0],
  ['Move right', NUDGE, 0],
  ['Move up', 0, -NUDGE],
  ['Move down', 0, NUDGE],
]

const RESIZES: [string, number, number][] = [
  ['Wider', NUDGE, 0],
  ['Narrower', -NUDGE, 0],
  ['Taller', 0, NUDGE],
  ['Shorter', 0, -NUDGE],
]

function ButtonRow({
  label,
  actions,
  onChange,
}: {
  label: string
  actions: [string, number, number][]
  onChange: Change
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {actions.map(([text, dx, dy]) => (
        <Button
          key={text}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(dx, dy)}
        >
          {text}
        </Button>
      ))}
    </div>
  )
}

export function BoxNudge({ onMove, onResize }: { onMove: Change; onResize: Change }) {
  return (
    <div className="space-y-2">
      <ButtonRow label="Move this box" actions={MOVES} onChange={onMove} />
      <ButtonRow label="Resize this box" actions={RESIZES} onChange={onResize} />
    </div>
  )
}
