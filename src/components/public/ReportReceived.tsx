const REFERENCE = /^CP-\d{4}-\d{4,}$/
const LINK = 'tap-target inline-flex items-center'

export type ReportReply = 'contact' | 'none' | 'anonymous'

export function reportReference(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && REFERENCE.test(value) ? value : null
}

const REPLY_TEXT: Record<ReportReply, string> = {
  contact: 'Town staff may contact you at the email or phone you gave if they have questions.',
  none: 'You left no email or phone, so town staff cannot reply to you.',
  anonymous: 'The town does not know who sent it, so it cannot reply to you.',
}

export function ReportReceived({
  reference,
  reply,
}: {
  reference: string | null
  reply: ReportReply
}) {
  return (
    <>
      <h1>Report received</h1>
      <p>Thank you. The town has your report.</p>
      {reference === null ? null : (
        <section aria-labelledby="reference-heading" data-plain>
          <h2 id="reference-heading" className="text-base font-semibold text-muted-foreground">
            Your reference
          </h2>
          <p className="m-0 font-serif text-4xl font-semibold text-ink">{reference}</p>
          <p className="m-0 text-ink-secondary">Keep it if you want to ask about this report.</p>
        </section>
      )}
      <section aria-labelledby="next-heading">
        <h2 id="next-heading">What happens next</h2>
        <p className="max-w-[65ch]">
          Town staff review every report and decide whether to look into it further.
        </p>
        <p className="max-w-[65ch]">{REPLY_TEXT[reply]}</p>
      </section>
      <nav aria-label="After your report" className="flex flex-wrap gap-6" data-plain>
        <a href="/" className={LINK}>
          Go to the home page
        </a>
        <a href="/complaints/new" className={LINK}>
          Report another problem
        </a>
      </nav>
    </>
  )
}
