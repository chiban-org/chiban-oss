'use client'

import { ActionForm } from '@/components/ActionForm'
import { AreaField, TextField } from '@/components/staff/fields'
import { ACTION_FILES_LIMIT_MB, complaintPhotosProblem } from '@/lib/uploadLimits'
import { submitComplaintAction } from './actions'

function photosProblem(form: HTMLFormElement): string | null {
  const input = form.elements.namedItem('photos')
  if (!(input instanceof HTMLInputElement) || input.files === null) return null
  return complaintPhotosProblem(Array.from(input.files, (file) => file.size))
}

export function ComplaintForm() {
  return (
    <ActionForm
      action={submitComplaintAction}
      submitLabel="Send report"
      variant="default"
      checkBeforeSubmit={photosProblem}
      className="flex max-w-xl flex-col gap-5"
    >
      <TextField label="Where is the property?" name="locationText" required maxLength={300} />
      <AreaField label="What did you see?" name="description" required maxLength={5000} rows={6} />
      <TextField
        label={`Photos (up to 5, JPEG or PNG, ${ACTION_FILES_LIMIT_MB} MB in all)`}
        name="photos"
        type="file"
        accept="image/jpeg,image/png"
        multiple
      />
      <p className="m-0 text-base">Your name and contact details are seen only by town staff.</p>
      <TextField label="Your name (optional)" name="name" maxLength={200} autoComplete="name" />
      <TextField
        label="Your email (optional)"
        name="email"
        type="email"
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
