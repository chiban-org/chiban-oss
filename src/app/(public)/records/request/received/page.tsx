import type { Metadata } from 'next'
import { formatCivilDate } from '@/lib/formatDate'

export const metadata: Metadata = { title: 'Request received' }

const REFERENCE = /^RK-\d{4}-\d{1,8}$/
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/
const LINK = 'tap-target inline-flex items-center'

function single(value: string | string[] | undefined, shape: RegExp): string | null {
  return typeof value === 'string' && shape.test(value) ? value : null
}

export default async function RequestReceivedPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string | string[]
    due?: string | string[]
    emailed?: string | string[]
  }>
}) {
  const params = await searchParams
  const reference = single(params.ref, REFERENCE)
  const due = single(params.due, CIVIL_DATE)
  return (
    <main>
      <h1>Request received</h1>
      <p>Thank you. The town has your Right-to-Know request.</p>
      {reference === null ? null : (
        <section aria-labelledby="reference-heading" data-plain>
          <h2 id="reference-heading" className="text-base font-semibold text-muted-foreground">
            Your request number
          </h2>
          <p className="m-0 font-serif text-4xl font-semibold text-ink">{reference}</p>
        </section>
      )}
      <section aria-labelledby="next-heading">
        <h2 id="next-heading">What happens next</h2>
        {due === null ? null : (
          <p className="max-w-[65ch]">{`The town will answer by ${formatCivilDate(due)}.`}</p>
        )}
        <p className="max-w-[65ch]">
          It will make the records available, deny the request in writing, or tell you in writing
          when it will answer.
        </p>
        <p className="max-w-[65ch]">
          {params.emailed === '0'
            ? 'The receipt email could not be sent. Keep this number to ask about your request.'
            : 'A receipt was sent to your email.'}
        </p>
      </section>
      <nav aria-label="After your request" className="flex flex-wrap gap-6" data-plain>
        <a href="/" className={LINK}>
          Go to the home page
        </a>
        <a href="/records/request" className={LINK}>
          Ask for other records
        </a>
      </nav>
    </main>
  )
}
