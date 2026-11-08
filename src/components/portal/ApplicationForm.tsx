'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { FormRenderer, type FormValue } from '@/components/forms/FormRenderer'
import { toFormData } from '@/components/portal/formValues'
import { Button } from '@/components/ui/button'
import { Checkbox, CheckLine } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RequiredNote } from '@/components/ui/required-mark'
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
}

export function ApplicationForm(props: Props) {
  const router = useRouter()
  const csrf = useCsrfToken()
  const [values, setValues] = useState<Record<string, unknown>>(props.initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attested, setAttested] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (kind: 'save' | 'submit') => {
    const data = toFormData(values, {
      csrf_token: csrf,
      applicationId: props.applicationId,
      attestationSha256: props.attestationSha256,
      attest: attested ? 'true' : 'false',
    })
    const outcome = await attempt(() => props.actions[kind](data), setPending)
    const result: ActionResult = outcome.ok ? outcome.value : { ok: false, error: outcome.error }
    setErrors(result.ok ? {} : (result.fieldErrors ?? {}))
    setMessage(result.ok ? result.message : result.error)
    if (result.ok && kind === 'submit') router.refresh()
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void run('submit')
      }}
      className="flex flex-col gap-6"
    >
      <RequiredNote />
      <FormRenderer
        addressChecks
        form={props.form}
        values={values}
        errors={errors}
        onChange={(key: string, value: FormValue) =>
          setValues((prev) => ({ ...prev, [key]: value }))
        }
      />
      <div className="flex items-start gap-3 rounded-md border p-4 text-base leading-snug">
        <CheckLine>
          <Checkbox
            id="attest"
            checked={attested}
            onCheckedChange={(next) => setAttested(next === true)}
          />
        </CheckLine>
        <Label htmlFor="attest" className="text-base leading-snug">
          {props.attestationText}
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="min-h-11 text-base" disabled={pending}>
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
    </form>
  )
}
