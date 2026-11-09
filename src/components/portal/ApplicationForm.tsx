'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useRef, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { FormRenderer, type FormValue } from '@/components/forms/FormRenderer'
import { AttestBox } from '@/components/portal/AttestBox'
import { ErrorSummary, type SummaryEntry } from '@/components/portal/ErrorSummary'
import { ATTEST_ID, toFormData } from '@/components/portal/formValues'
import { LiveAnswersContext } from '@/components/portal/liveAnswers'
import { Button } from '@/components/ui/button'
import { RequiredNote } from '@/components/ui/required-mark'
import {
  type DocumentRequirement,
  missingRequirements,
} from '@/features/applications/liveChecklist'
import type { FormBody } from '@/features/forms/formSchema'
import { attempt } from '@/lib/attempt'
import type { ActionResult } from '@/server/actionRunner'

export interface ApplicationFormActions {
  save: (formData: FormData) => Promise<ActionResult>
  submit: (formData: FormData) => Promise<ActionResult>
}

interface Props {
  applicationId: string
  form: FormBody
  initialValues: Record<string, unknown>
  attestationText: string
  attestationSha256: string
  actions: ApplicationFormActions
  requirements?: readonly DocumentRequirement[]
  documents?: ReactNode
}

export const APPLICATION_FORM_ID = 'application-form'
const ATTEST_LABEL = 'Confirmation'

function MissingDocuments({ names }: { names: string[] }) {
  if (names.length === 0) return null
  return (
    <p className="m-0 text-base">
      {`Before you submit, add: ${names.join(', ')}. `}
      <a href="#documents-heading" className="tap-target">
        Go to documents
      </a>
    </p>
  )
}

function summaryOf(form: FormBody, errors: Record<string, string>): SummaryEntry[] {
  const fields = form.fields.flatMap((field) => {
    const message = errors[field.key]
    return message === undefined
      ? []
      : [{ target: `field-${field.key}`, label: field.label, message }]
  })
  const attest = errors[ATTEST_ID]
  return attest === undefined
    ? fields
    : [...fields, { target: ATTEST_ID, label: ATTEST_LABEL, message: attest }]
}

function withoutKey(errors: Record<string, string>, key: string): Record<string, string> {
  if (!(key in errors)) return errors
  const { [key]: _gone, ...rest } = errors
  return rest
}

export function ApplicationForm(props: Props) {
  const router = useRouter()
  const csrf = useCsrfToken()
  const [values, setValues] = useState<Record<string, unknown>>(props.initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attested, setAttested] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const summaryHeading = useRef<HTMLHeadingElement>(null)

  const run = async (kind: 'save' | 'submit') => {
    const data = toFormData(values, {
      csrf_token: csrf,
      applicationId: props.applicationId,
      attestationSha256: props.attestationSha256,
      attest: attested ? 'true' : 'false',
    })
    const outcome = await attempt(() => props.actions[kind](data), setPending)
    const result: ActionResult = outcome.ok ? outcome.value : { ok: false, error: outcome.error }
    const refused = result.ok ? {} : (result.fieldErrors ?? {})
    setErrors(refused)
    setMessage(result.ok ? result.message : result.error)
    if (Object.keys(refused).length > 0) setTries((n) => n + 1)
    if (result.ok) router.refresh()
  }

  return (
    <LiveAnswersContext.Provider value={values}>
      <div className="flex flex-col gap-8">
        <form
          id={APPLICATION_FORM_ID}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void run('submit')
          }}
          className="flex flex-col gap-6"
        >
          <ErrorSummary
            entries={summaryOf(props.form, errors)}
            attempt={tries}
            headingRef={summaryHeading}
          />
          <RequiredNote />
          <FormRenderer
            addressChecks
            form={props.form}
            values={values}
            errors={errors}
            onChange={(key: string, value: FormValue) => {
              setValues((prev) => ({ ...prev, [key]: value }))
              setErrors((prev) => withoutKey(prev, key))
            }}
          />
        </form>
        {props.documents}
        <div className="flex flex-col gap-4">
          <AttestBox
            text={props.attestationText}
            checked={attested}
            error={errors[ATTEST_ID]}
            onChange={(next) => {
              setAttested(next)
              setErrors((prev) => withoutKey(prev, ATTEST_ID))
            }}
          />
          <MissingDocuments names={missingRequirements(props.requirements ?? [], values)} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              form={APPLICATION_FORM_ID}
              className="min-h-11 text-base"
              disabled={pending}
            >
              Submit application
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 text-base"
              disabled={pending}
              onClick={() => void run('save')}
            >
              Save draft
            </Button>
            {message === null ? null : (
              <p role="status" className="m-0 text-base">
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    </LiveAnswersContext.Provider>
  )
}
