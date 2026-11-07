import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DescriptionList } from '@/components/ui/description-list'
import type { LimitedApplicationView } from '@/features/applications/limitedApplicationView'
import { isTerminalState } from '@/features/applications/states'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatCivilDate } from '@/lib/formatDate'

type Assignment = LimitedApplicationView['assignments'][number]

function dueText(commentDue: string | null): string {
  return commentDue === null
    ? 'No comment date is set'
    : `Comments due ${formatCivilDate(commentDue)}`
}

function reviewOpen(view: LimitedApplicationView, a: Assignment): boolean {
  return a.status !== 'signed_off' && !isTerminalState(view.state)
}

export function reviewSentence(view: LimitedApplicationView): string | null {
  if (view.assignments.length === 0) return null
  const open = view.assignments.find((a) => reviewOpen(view, a))
  if (open !== undefined) return `Waiting on: Reviewer (you). ${dueText(open.commentDue)}.`
  if (isTerminalState(view.state)) return 'This application is finished, so the review is closed.'
  return 'You signed off on this review.'
}

export function ReviewCard({ view }: { view: LimitedApplicationView }) {
  if (view.assignments.length === 0) return null
  return (
    <section aria-label="Your review" id="your-review" data-plain className="rail-card">
      <h2 className="font-sans text-sm font-semibold text-muted-foreground">Your review</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {view.assignments.map((a) => (
          <li key={a.assignmentId} className="flex flex-col items-start gap-2">
            <span className="font-semibold">{`${dueText(a.commentDue)}.`}</span>
            <span className="text-sm text-muted-foreground">{reviewStatusLabel(a.status)}</span>
            <Button asChild variant={reviewOpen(view, a) ? 'default' : 'outline'}>
              <Link href={`/staff/reviews/${a.assignmentId}`}>Open your review</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ProjectSummary({ view }: { view: LimitedApplicationView }) {
  return (
    <section aria-label="Project summary" id="project-summary">
      <h2>Project summary</h2>
      <DescriptionList
        labelWidth="wide"
        items={view.summary.map((row) => ({ label: row.label, value: row.text }))}
      />
    </section>
  )
}
