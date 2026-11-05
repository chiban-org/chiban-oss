'use client'

import Link from 'next/link'
import { ClaimLinkButton } from '@/components/counter/ClaimLinkButton'
import type { CounterActions, CounterOutcome } from '@/components/counter/counterTypes'
import type { Method } from '@/components/counter/QuickIssueSections'
import { FactList } from '@/components/layout/PageHeader'
import { NEW_TAB } from '@/components/newTab'
import { Button } from '@/components/ui/button'
import { formatCents } from '@/lib/money'

export interface IssuedReceipt {
  typeLabel: string
  parcelLabel: string
  contractorName: string
  paidCents: number
  method: Method
}

function Printouts({ links }: { links: Extract<CounterOutcome, { ok: true }>['links'] }) {
  if (links === null) return null
  const printouts: [string, string | null][] = [
    ['Permit', links.permit],
    ['Placard', links.placard],
    ['Receipt', links.receipt],
  ]
  return (
    <div className="flex flex-wrap gap-3">
      {printouts.map(([label, href]) =>
        href === null ? null : (
          <Button key={label} asChild variant="outline" className="no-underline">
            <a href={href} {...NEW_TAB}>
              {label}
            </a>
          </Button>
        ),
      )}
    </div>
  )
}

export function IssuedPanel({
  outcome,
  receipt,
  claim,
}: {
  outcome: Extract<CounterOutcome, { ok: true }>
  receipt: IssuedReceipt
  claim?: CounterActions['claim']
}) {
  return (
    <section aria-labelledby="issued">
      <h2 id="issued" role="status">
        {outcome.number} is issued
      </h2>
      <FactList
        facts={[
          { label: 'Permit type', value: receipt.typeLabel },
          { label: 'Parcel', value: receipt.parcelLabel },
          { label: 'Contractor', value: receipt.contractorName },
          { label: 'Paid', value: `${formatCents(receipt.paidCents)} by ${receipt.method}` },
        ]}
      />
      <Printouts links={outcome.links} />
      {claim === undefined ? null : (
        <ClaimLinkButton applicationId={outcome.applicationId} send={claim} />
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button asChild className="no-underline">
          <Link href="/staff/counter">Issue another permit</Link>
        </Button>
        <Link href={`/staff/applications/${outcome.applicationId}`}>
          Open the application record
        </Link>
      </div>
    </section>
  )
}
