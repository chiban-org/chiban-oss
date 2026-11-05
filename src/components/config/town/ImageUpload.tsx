'use client'

import { useId, useState } from 'react'
import { uploadTownImageAction } from '@/app/(staff)/staff/settings/town-profile/actions'
import { useCsrfToken } from '@/components/CsrfProvider'
import { Button } from '@/components/ui/button'
import { FilePicker } from '@/components/ui/file-picker'
import { ensureCsrfAction } from '@/features/auth/csrfRefresh'
import type { TownImage } from '@/features/town/profileSchema'
import { attempt } from '@/lib/attempt'

export function townImageUrl(image: TownImage): string {
  return `/staff/settings/town-assets/${image.objectKey.split('/').at(-1) ?? ''}`
}

interface Props {
  label: string
  hint: string
  image: TownImage | null
  onChange: (image: TownImage | null) => void
  previewClassName?: string
}

export function ImageUpload({ label, hint, image, onChange, previewClassName }: Props) {
  const inputId = useId()
  const csrf = useCsrfToken()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pickerKey, setPickerKey] = useState(0)

  const upload = async (files: File[]) => {
    const file = files[0]
    if (file === undefined) return
    const data = new FormData()
    data.set('csrf_token', csrf === '' ? await ensureCsrfAction() : csrf)
    data.set('file', file)
    const outcome = await attempt(() => uploadTownImageAction(data), setPending)
    setPickerKey((key) => key + 1)
    if (!outcome.ok) return setError(outcome.error)
    if (!outcome.value.ok) return setError(outcome.value.error)
    setError(null)
    onChange(outcome.value.image)
  }

  return (
    <div className="grid gap-2" data-field-upload={label}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      {image === null ? (
        <p className="m-0 text-sm text-muted-foreground">None uploaded.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <img
            src={townImageUrl(image)}
            alt={`${label} as uploaded`}
            className={
              previewClassName ?? 'max-h-16 max-w-40 rounded border border-hairline bg-surface p-1'
            }
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        </div>
      )}
      <FilePicker
        key={pickerKey}
        id={inputId}
        accept="image/png,image/jpeg"
        aria-describedby={`${inputId}-hint`}
        disabled={pending}
        onFilesChange={(files) => void upload(files)}
      />
      <p id={`${inputId}-hint`} className="m-0 text-sm text-muted-foreground">
        {pending ? 'Uploading' : hint}
      </p>
      {error === null ? null : (
        <p role="alert" className="m-0 text-sm text-status-failed-fg">
          {error}
        </p>
      )}
    </div>
  )
}
