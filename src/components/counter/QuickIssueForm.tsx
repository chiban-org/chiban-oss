'use client'

import { useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import type { CounterActions, CounterOutcome } from '@/components/counter/counterTypes'
import {
  ContractorSection,
  FeeSection,
  IssuedNotice,
  type Method,
  PaymentSection,
  type WorkField,
  WorkSection,
} from '@/components/counter/QuickIssueSections'
import { ReaderPanel } from '@/components/counter/ReaderPanel'
import { NEW_TAB } from '@/components/newTab'
import { Button } from '@/components/ui/button'
import { computeConvenienceFee } from '@/features/payments/convenienceFee'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'
import { attempt } from '@/lib/attempt'

interface Props {
  parcelId: string
  typeKey: string
  typeLabel: string
  fields: WorkField[]
  baseCents: number
  convenienceFee: PaymentSettingsBody['convenienceFee']
  cardAvailable: boolean
  readerSimulated: boolean
  lookup: { label: string; url: string }
  actions: CounterActions
}

function openPrintouts(result: CounterOutcome): void {
  if (!result.ok || result.state !== 'issued' || result.links === null) return
  for (const href of [result.links.permit, result.links.placard, result.links.receipt]) {
    if (href !== null) window.open(href, NEW_TAB.target, 'noopener')
  }
}

export function QuickIssueForm(props: Props) {
  const csrf = useCsrfToken()
  const [method, setMethod] = useState<Method>('cash')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<CounterOutcome | null>(null)
  const [declinedApplicationId, setDeclinedApplicationId] = useState<string | null>(null)

  const channel = method === 'card' ? 'card_present' : method
  const convenienceCents = computeConvenienceFee(props.baseCents, props.convenienceFee, channel)

  const show = (result: CounterOutcome) => {
    setOutcome(result)
    openPrintouts(result)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    data.set('csrf_token', csrf)
    if (declinedApplicationId !== null) data.set('applicationId', declinedApplicationId)
    setDeclinedApplicationId(null)
    const result = await attempt(() => props.actions.issue(data), setPending)
    show(result.ok ? result.value : { ok: false, error: result.error })
  }

  const issued = outcome?.ok === true && outcome.state === 'issued' ? outcome : null
  const waiting = outcome?.ok === true && outcome.state === 'submitted' ? outcome : null
  const readerBusy = waiting !== null && declinedApplicationId === null

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-6">
      <input type="hidden" name="parcelId" value={props.parcelId} />
      <input type="hidden" name="typeKey" value={props.typeKey} />
      <ContractorSection defaultLicenseType={props.typeLabel} lookup={props.lookup} />
      <WorkSection fields={props.fields} />
      <FeeSection
        baseCents={props.baseCents}
        convenienceCents={convenienceCents}
        card={method === 'card'}
      />
      <PaymentSection
        method={method}
        onMethod={setMethod}
        cardAvailable={props.cardAvailable}
        readerSimulated={props.readerSimulated}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || issued !== null || readerBusy}>
          Issue and print
        </Button>
        {outcome?.ok === false ? <p role="alert">{outcome.error}</p> : null}
      </div>
      {issued === null ? null : <IssuedNotice outcome={issued} claim={props.actions.claim} />}
      {waiting?.attemptId == null ? null : (
        <ReaderPanel
          key={waiting.attemptId}
          attemptId={waiting.attemptId}
          applicationId={waiting.applicationId}
          simulated={props.readerSimulated}
          actions={props.actions}
          onIssued={show}
          onDeclined={() => setDeclinedApplicationId(waiting.applicationId)}
        />
      )}
    </form>
  )
}
