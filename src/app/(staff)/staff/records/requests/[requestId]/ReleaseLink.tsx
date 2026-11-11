import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { LINK_DAYS } from '@/features/rtk/releaseMail'
import type { ReleaseSummary } from '@/features/rtk/requestPage'
import { formatInstantDate } from '@/lib/formatDate'
import { reissueLinkAction } from '../actions'

export interface LinkContext {
  canManage: boolean
  timeZone: string
  requesterEmail: string | null
}

function linkLine(link: NonNullable<ReleaseSummary['link']>, timeZone: string): string {
  if (link.revoked) return 'The link was turned off.'
  const on = formatInstantDate(link.expiresAt, timeZone)
  return link.expired ? `The link expired on ${on}.` : `The link works until ${on}.`
}

export function ReleaseLink({ release, ctx }: { release: ReleaseSummary; ctx: LinkContext }) {
  const link = release.link
  if (link === null) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-sm text-ink-secondary">{linkLine(link, ctx.timeZone)}</p>
      {release.reissues.map((r) => (
        <p key={r.sentAt.toISOString()} className="m-0 text-sm text-ink-secondary">
          {`New link sent to ${r.sentTo} on ${formatInstantDate(r.sentAt, ctx.timeZone)}.`}
        </p>
      ))}
      {ctx.canManage && link.expired && !link.revoked ? (
        <details>
          <summary className="text-sm">Send a new link</summary>
          <ActionForm action={reissueLinkAction} submitLabel="Send a new link">
            <input type="hidden" name="releaseId" value={release.id} />
            <TextField
              label="Send it to"
              name="recipientEmail"
              type="email"
              defaultValue={ctx.requesterEmail ?? ''}
              hint={`The new link works for ${LINK_DAYS} days. The expired link stays closed.`}
              required
            />
          </ActionForm>
        </details>
      ) : null}
    </div>
  )
}
