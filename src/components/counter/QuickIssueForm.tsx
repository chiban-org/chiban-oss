'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import type {
  CounterActions,
  CounterOutcome,
  FieldErrors,
  LicenseGroup,
} from '@/components/counter/counterTypes'
import { IssuedPanel, type IssuedReceipt } from '@/components/counter/IssuedPanel'
import {
  ContractorSection,
  FeeSection,
  type Method,
  PaymentSection,
  type WorkField,
  WorkSection,
} from '@/components/counter/QuickIssueSections'
import { ReaderPanel } from '@/components/counter/ReaderPanel'
import { FieldErrorsProvider } from '@/components/fieldErrors'
import { focusFirstRefused } from '@/components/formValidity'
import { NEW_TAB } from '@/components/newTab'
import { Button } from '@/components/ui/button'
import { RequiredNote } from '@/components/ui/required-mark'
import { computeConvenienceFee } from '@/features/payments/convenienceFee'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'
import { attempt } from '@/lib/attempt'

interface Props {
  parcelId: string
  typeKey: string
  typeLabel: string
  parcelLabel: string
  summary: ReactNode
  fields: WorkField[]
  baseCents: number
  convenienceFee: PaymentSettingsBody['convenienceFee']
  cardAvailable: boolean
  readerSimulated: boolean
  licenseRequired: boolean
  licenseGroups: readonly LicenseGroup[]
  defaultLicenseType: string | null
  lookup: { label: string; url: string }
  actions: CounterActions
}

const NO_FIELD_ERRORS: FieldErrors = {}

function openPrintouts(result: CounterOutcome): void {
  if (!result.ok || result.state !== 'issued' || result.links === null) return
  for (const href of [result.links.permit, result.links.placard, result.links.receipt]) {
    if (href !== null) window.open(href, NEW_TAB.target, 'noopener')
  }
}

type Accepted = Extract<CounterOutcome, { ok: true }>

function accepted(outcome: CounterOutcome | null, state: Accepted['state']): Accepted | null {
  return outcome?.ok === true && outcome.state === state ? outcome : null
}

function receiptFor(
  props: Props,
  data: FormData,
  method: Method,
  paidCents: number,
): IssuedReceipt {
  const contractorName = data.get('contractorName')
  return {
    typeLabel: props.typeLabel,
    parcelLabel: props.parcelLabel,
    contractorName: typeof contractorName === 'string' ? contractorName.trim() : '',
    contractorLabel: props.licenseRequired ? 'Contractor' : 'Applicant',
    paidCents,
    method,
  }
}

export function QuickIssueForm(props: Props) {
  const csrf = useCsrfToken()
  const [method, setMethod] = useState<Method>('cash')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<CounterOutcome | null>(null)
  const [declinedApplicationId, setDeclinedApplicationId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<IssuedReceipt | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(NO_FIELD_ERRORS)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    focusFirstRefused(form.current, Object.keys(fieldErrors))
  }, [fieldErrors])

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
    setReceipt(receiptFor(props, data, method, props.baseCents + convenienceCents))
    if (declinedApplicationId !== null) data.set('applicationId', declinedApplicationId)
    setDeclinedApplicationId(null)
    setFieldErrors(NO_FIELD_ERRORS)
    const result = await attempt(() => props.actions.issue(data), setPending)
    const outcome: CounterOutcome = result.ok ? result.value : { ok: false, error: result.error }
    if (!outcome.ok && outcome.fieldErrors !== undefined) setFieldErrors(outcome.fieldErrors)
    show(outcome)
  }

  const issued = accepted(outcome, 'issued')
  const waiting = accepted(outcome, 'submitted')
  const readerBusy = waiting !== null && declinedApplicationId === null

  if (issued !== null && receipt !== null) {
    return <IssuedPanel outcome={issued} receipt={receipt} claim={props.actions.claim} />
  }

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(event) => void submit(event)}
      onInput={() => setFieldErrors(NO_FIELD_ERRORS)}
      className="space-y-6"
    >
      {props.summary}
      <RequiredNote />
      <FieldErrorsProvider errors={fieldErrors}>
        <input type="hidden" name="parcelId" value={props.parcelId} />
        <input type="hidden" name="typeKey" value={props.typeKey} />
        <ContractorSection
          licenseRequired={props.licenseRequired}
          licenseGroups={props.licenseGroups}
          defaultLicenseType={props.defaultLicenseType ?? ''}
          lookup={props.lookup}
        />
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
      </FieldErrorsProvider>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || readerBusy}>
          Issue and print
        </Button>
        {outcome?.ok === false ? <p role="alert">{outcome.error}</p> : null}
      </div>
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
