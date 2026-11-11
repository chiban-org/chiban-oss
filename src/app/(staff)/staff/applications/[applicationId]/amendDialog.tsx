'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { FormRenderer, type FormValue } from '@/components/forms/FormRenderer'
import type { AmendFormData } from '@/features/applications/amendForm'
import type { ActionResult } from '@/server/actionRunner'

type Save = (formData: FormData) => Promise<ActionResult>

function AmendForm({ data, save }: { data: AmendFormData; save: Save }) {
  const [values, setValues] = useState<Record<string, unknown>>(data.values)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const send: Save = async (formData) => {
    const reply = await save(formData)
    setErrors(reply.ok ? {} : (reply.fieldErrors ?? {}))
    return reply
  }
  return (
    <ActionForm action={send} submitLabel="Save changes" variant="default" closeOnSuccess>
      <input type="hidden" name="applicationId" value={data.applicationId} />
      <input type="hidden" name="values" value={JSON.stringify(values)} />
      <FormRenderer
        includeStaffOnly
        form={data.form}
        values={values}
        errors={errors}
        onChange={(key: string, value: FormValue) => {
          setValues((prev) => ({ ...prev, [key]: value }))
          setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)))
        }}
      />
    </ActionForm>
  )
}

export function AmendApplicationDialog({ data, save }: { data: AmendFormData; save: Save }) {
  return (
    <FormDialog
      label="Edit the application"
      title={`Edit application ${data.number}`}
      description="Correct the answers on this application. Each change is listed in the recent activity with the old and new answer."
    >
      <AmendForm data={data} save={save} />
    </FormDialog>
  )
}
