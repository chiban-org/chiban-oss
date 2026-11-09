'use client'

import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePicker } from '@/components/ui/file-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark, RequiredNote } from '@/components/ui/required-mark'
import { Textarea } from '@/components/ui/textarea'
import { ACTION_FILES_LIMIT_MB, complaintPhotosProblem } from '@/lib/uploadLimits'
import { MAX_DESCRIPTION_CHARS, MAX_PHOTOS } from './limits'

function photosProblem(form: HTMLFormElement): string | null {
  const input = form.elements.namedItem('photos')
  if (!(input instanceof HTMLInputElement) || input.files === null) return null
  const files = Array.from(input.files)
  if (files.length > MAX_PHOTOS) return `Attach no more than ${MAX_PHOTOS} photos.`
  return complaintPhotosProblem(files.map((file) => file.size))
}

export function AnonymousReportForm() {
  const [problem, setProblem] = useState<string | null>(null)
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const found = photosProblem(event.currentTarget)
    setProblem(found)
    if (found !== null) event.preventDefault()
  }
  return (
    <form
      method="post"
      action="/intake/anonymous"
      encType="multipart/form-data"
      onSubmit={onSubmit}
      className="mt-4 flex max-w-xl flex-col gap-5"
    >
      <RequiredNote />
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">
          <span>
            Where is the property?
            <RequiredMark />
          </span>
        </Label>
        <Input id="location" name="location" required maxLength={300} autoComplete="off" />
      </div>
      <p className="m-0 max-w-prose text-base">
        Anything you type or attach may identify you. Leave out your name, your address, and details
        only you would know. Photos are stripped of location and camera data before they are saved.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">
          <span>
            What did you see?
            <RequiredMark />
          </span>
        </Label>
        <Textarea
          id="description"
          name="description"
          required
          maxLength={MAX_DESCRIPTION_CHARS}
          rows={6}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="photos">{`Photos (up to ${MAX_PHOTOS}, JPEG or PNG, ${ACTION_FILES_LIMIT_MB} MB in all)`}</Label>
        <FilePicker id="photos" name="photos" accept="image/jpeg,image/png" multiple />
        {problem === null ? null : (
          <p role="alert" className="m-0 font-semibold text-status-failed-fg">
            {problem}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="min-h-11 self-start text-base">
        Send report
      </Button>
    </form>
  )
}
