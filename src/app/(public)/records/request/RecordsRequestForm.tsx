'use client'

import { ActionForm } from '@/components/ActionForm'
import { AreaField, TextField } from '@/components/staff/fields'
import { submitRecordsRequestAction } from './actions'

export function RecordsRequestForm() {
  return (
    <ActionForm
      action={submitRecordsRequestAction}
      submitLabel="Send request"
      variant="default"
      className="flex max-w-xl flex-col gap-5"
    >
      <AreaField
        label="What records are you asking for?"
        name="description"
        hint="Name the property, the dates, and the kind of record if you know them."
        required
        maxLength={5000}
        rows={6}
      />
      <p className="m-0 text-base">Your name and contact details are seen only by town staff.</p>
      <TextField
        label="Your name (optional)"
        name="requesterName"
        maxLength={200}
        autoComplete="name"
      />
      <TextField
        label="Your email"
        name="email"
        type="email"
        hint="The town sends your receipt and its answer here."
        required
        maxLength={320}
        autoComplete="email"
      />
      <TextField
        label="Your phone (optional)"
        name="phone"
        type="tel"
        maxLength={40}
        autoComplete="tel"
      />
    </ActionForm>
  )
}
