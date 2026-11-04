'use client'

import { Monitor, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { PressedGroup } from '@/components/config/formBuilder/PressedGroup'
import { FormRenderer, type FormValue } from '@/components/forms/FormRenderer'
import { Button } from '@/components/ui/button'
import type { FormBody } from '@/features/forms/formSchema'
import { validateSubmission } from '@/features/forms/validateSubmission'
import { fieldErrorCopy } from '@/features/portal/formData'
import { cn } from '@/lib/utils'

type Width = 'desktop' | 'phone'

const WIDTHS = [
  ['desktop', 'Desktop', Monitor],
  ['phone', 'Phone', Smartphone],
] as const

export function ApplicantPreview({ form }: { form: FormBody }) {
  const [width, setWidth] = useState<Width>('desktop')
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<string | null>(null)
  const check = () => {
    const result = validateSubmission(form, values, { asStaff: false })
    if (result.ok) {
      setErrors({})
      setStatus('Every answer passes the form’s checks.')
      return
    }
    setErrors(Object.fromEntries(result.error.map((e) => [e.field, fieldErrorCopy(e.code)])))
    setStatus(
      result.error.length === 1
        ? 'One answer needs attention.'
        : `${result.error.length} answers need attention.`,
    )
  }
  return (
    <div className="grid gap-3">
      <PressedGroup label="Preview width" options={WIDTHS} value={width} onChange={setWidth} />
      <div
        className={cn(
          'mx-auto w-full rounded-md border border-hairline bg-surface',
          width === 'phone' ? 'max-w-[390px] rounded-[1.25rem] p-4' : 'p-6',
        )}
      >
        <h2 className="mt-0 mb-4 text-xl">{form.label}</h2>
        <FormRenderer
          form={form}
          values={values}
          errors={errors}
          onChange={(key: string, value: FormValue) =>
            setValues((prev) => ({ ...prev, [key]: value }))
          }
        />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" className="min-h-11 text-base" onClick={check}>
            Check answers
          </Button>
          <p role="status" className="m-0 text-base">
            {status}
          </p>
        </div>
      </div>
    </div>
  )
}
