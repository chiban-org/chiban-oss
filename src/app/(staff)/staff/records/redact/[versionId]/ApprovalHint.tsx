export interface ApprovalHintProps {
  requestId: string | undefined
  recordHref: string | null
  canPublish: boolean
}

function Place({ href, children }: { href: string | null; children: string }) {
  return href === null ? children : <a href={href}>{children}</a>
}

export function ApprovalHint({ requestId, recordHref, canPublish }: ApprovalHintProps) {
  return (
    <section aria-labelledby="approval-hint" data-plain className="space-y-2">
      <h2 id="approval-hint">After the copy is made</h2>
      <p>
        A copy for the public website is approved in the Documents section of{' '}
        <Place href={recordHref}>the record&apos;s page</Place>.
        {canPublish
          ? null
          : ' That takes permission to publish documents, so a staff member who has it approves it.'}
      </p>
      {requestId === undefined ? (
        <p>
          A copy for a Right-to-Know request is approved under Releases on the request page. Open
          this page from the request to make one.
        </p>
      ) : (
        <p>
          A copy for this Right-to-Know request is approved under Releases on the{' '}
          <Place href={`/staff/records/requests/${requestId}`}>request page</Place>.
        </p>
      )}
    </section>
  )
}
