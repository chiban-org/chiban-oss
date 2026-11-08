'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { FormRenderer, type FormValue } from '@/components/forms/FormRenderer'
import { toFormData } from '@/components/portal/formValues'
import { Button } from '@/components/ui/button'
import { RequiredNote } from '@/components/ui/required-mark'
import type { FormBody } from '@/features/forms/formSchema'
import { attempt } from '@/lib/attempt'
import {
  type IntakeSaveResult,
  SAVE_AND_CONTINUE,
  SAVE_FOR_LATER,
  type SaveIntent,
} from './intakeTypes'

interface Props {
  applicationId: string
  form: FormBody
  initialValues: Record<string, unknown>
  save: (formData: FormData) => Promise<IntakeSaveResult>
}

export function IntakeForm({ applicationId, form, initialValues, save }: Props) {
  const router = useRouter()
  const csrf = useCsrfToken()
  const [values, setValues] = useState<Record<string, unknown>>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (intent: SaveIntent) => {
    const data = toFormData(values, { csrf_token: csrf, applicationId, intent })
    const outcome = await attempt(() => save(data), setPending)
    const result: IntakeSaveResult = outcome.ok
      ? outcome.value
      : { ok: false, error: outcome.error }
    setErrors(result.ok ? {} : (result.fieldErrors ?? {}))
    setMessage(result.ok ? result.message : result.error)
    if (result.ok) router.push(result.next)
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void run(SAVE_AND_CONTINUE)
      }}
      className="flex flex-col gap-6"
    >
      <RequiredNote />
      <FormRenderer
        addressChecks
        includeStaffOnly
        form={form}
        values={values}
        errors={errors}
        onChange={(key: string, value: FormValue) =>
          setValues((prev) => ({ ...prev, [key]: value }))
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="min-h-11 text-base" disabled={pending}>
          Save and continue
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 text-base"
          disabled={pending}
          onClick={() => void run(SAVE_FOR_LATER)}
        >
          Save and finish later
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
