import { ActionForm } from '@/components/ActionForm'
import { ENDABLE_FROM, type Ending } from '@/features/portal/endApplication'
import type { PortalApplicationView } from '@/features/portal/portalView'
import type { ActionResult } from '@/server/actionRunner'
import { deleteDraftAction, withdrawApplicationAction } from './endingActions'

interface EndingCopy {
  heading: string
  lead: string
  submitLabel: string
  action: (formData: FormData) => Promise<ActionResult>
  confirm: { title: string; body: string; confirmLabel: string; cancelLabel: string }
}

const COPY: Record<Ending, EndingCopy> = {
  withdraw: {
    heading: 'Withdraw this application',
    lead: 'The town stops its review. The application stays on file as withdrawn. To go ahead later you would start a new one.',
    submitLabel: 'Withdraw application',
    action: withdrawApplicationAction,
    confirm: {
      title: 'Withdraw this application?',
      body: 'The town stops reviewing it. This cannot be undone.',
      confirmLabel: 'Withdraw',
      cancelLabel: 'Keep the application',
    },
  },
  delete_draft: {
    heading: 'Delete this draft',
    lead: 'This draft was never sent to the town.',
    submitLabel: 'Delete draft',
    action: deleteDraftAction,
    confirm: {
      title: 'Delete this draft?',
      body: 'It leaves your list and cannot be submitted or brought back. The town keeps a note that the draft was withdrawn.',
      confirmLabel: 'Delete draft',
      cancelLabel: 'Keep the draft',
    },
  },
}

function endingFor(view: PortalApplicationView): Ending | null {
  if (!view.record.mayEnd) return null
  if (ENDABLE_FROM.delete_draft.includes(view.state)) return 'delete_draft'
  return ENDABLE_FROM.withdraw.includes(view.state) ? 'withdraw' : null
}

export function EndingActions({ view }: { view: PortalApplicationView }) {
  const ending = endingFor(view)
  if (ending === null) return null
  const copy = COPY[ending]
  return (
    <section aria-labelledby="ending-heading">
      <h2 id="ending-heading">{copy.heading}</h2>
      <p>{copy.lead}</p>
      <ActionForm
        action={copy.action}
        submitLabel={copy.submitLabel}
        variant="destructive"
        confirm={copy.confirm}
      >
        <input type="hidden" name="applicationId" value={view.applicationId} />
        <input type="hidden" name="expectedRowVersion" value={view.record.rowVersion} />
      </ActionForm>
    </section>
  )
}
