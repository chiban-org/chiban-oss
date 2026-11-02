'use client'

import { ActionForm } from '@/components/ActionForm'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { submitComplaintAction } from './actions'

export function ComplaintForm() {
  return (
    <ActionForm
      action={submitComplaintAction}
      submitLabel="Send complaint"
      variant="default"
      className="flex max-w-xl flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="locationText">Where is the property?</Label>
        <Input id="locationText" name="locationText" required maxLength={300} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">What did you see?</Label>
        <Textarea id="description" name="description" required maxLength={5000} rows={6} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="photos">Photos (up to 5, JPEG or PNG)</Label>
        <Input id="photos" name="photos" type="file" accept="image/jpeg,image/png" multiple />
      </div>
      <p className="m-0 text-base">Your name and contact details are seen only by town staff.</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Your name (optional)</Label>
        <Input id="name" name="name" maxLength={200} autoComplete="name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Your email (optional)</Label>
        <Input id="email" name="email" type="email" maxLength={320} autoComplete="email" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Your phone (optional)</Label>
        <Input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" />
      </div>
    </ActionForm>
  )
}
