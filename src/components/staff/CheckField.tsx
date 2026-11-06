'use client'

import { type ComponentProps, type ReactNode, useId } from 'react'
import { FieldErrorMessage, useControlAria } from '@/components/fieldErrors'
import { Checkbox, CheckLine } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { cn } from '@/lib/utils'

export function CheckField({
  label,
  id,
  className,
  ...props
}: ComponentProps<typeof Checkbox> & { label: ReactNode }) {
  const generated = useId()
  const controlId = id ?? generated
  const { error, aria } = useControlAria(props.name, undefined)
  return (
    <div
      data-slot="check-field"
      className={cn('flex items-start gap-2 text-sm leading-snug', className)}
    >
      <CheckLine>
        <Checkbox id={controlId} {...aria} {...props} />
      </CheckLine>
      <div className="grid gap-1">
        <Label htmlFor={controlId} className="leading-snug font-normal">
          <span>
            {label}
            {props.required === true ? <RequiredMark /> : null}
          </span>
        </Label>
        <FieldErrorMessage error={error} />
      </div>
    </div>
  )
}
