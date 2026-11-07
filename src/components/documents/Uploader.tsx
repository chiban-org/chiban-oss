'use client'

import { useId, useState } from 'react'
import { toast } from 'sonner'
import { useCsrfToken } from '@/components/CsrfProvider'
import { Button } from '@/components/ui/button'
import { FilePicker } from '@/components/ui/file-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RecordRef } from '@/features/documents/types'
import { TITLE_MAX } from '@/features/documents/uploadLimits'
import { attempt } from '@/lib/attempt'

export type IntentResult =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }
export type FinalizeResult = { ok: true; documentId?: string } | { ok: false; error: string }

export interface UploaderActions {
  createIntent: (formData: FormData) => Promise<IntentResult>
  finalize: (formData: FormData) => Promise<FinalizeResult>
}

export type PutFile = (
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
) => Promise<boolean>

interface UploaderProps {
  target: RecordRef
  maxBytes: number
  actions: UploaderActions
  onUploaded: (documentId?: string) => void
  put?: PutFile
  extraFields?: Record<string, string>
  accept?: string
  capture?: 'environment' | 'user'
  fileLabel?: string
}

const BYTES_PER_MB = 1024 * 1024
const PERCENT = 100
const UPLOADED = 'Uploaded.'

export const putWithProgress: PutFile = (url, headers, file, onProgress) =>
  new Promise((resolve) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * PERCENT))
    }
    request.onload = () => resolve(request.status >= 200 && request.status < 300)
    request.onerror = () => resolve(false)
    request.send(file)
  })

function tooLargeCopy(maxBytes: number): string {
  return `That file is larger than ${Math.floor(maxBytes / BYTES_PER_MB)} MB.`
}

export function Uploader({
  target,
  maxBytes,
  actions,
  onUploaded,
  put = putWithProgress,
  extraFields = {},
  accept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  capture,
  fileLabel = 'File',
}: UploaderProps) {
  const csrf = useCsrfToken()
  const fieldId = useId()
  const fileId = `${fieldId}-file`
  const titleId = `${fieldId}-title`
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pickerKey, setPickerKey] = useState(0)

  const intentForm = (chosen: File): FormData => {
    const data = new FormData()
    data.set('csrf_token', csrf)
    data.set('targetKind', target.kind)
    data.set('targetId', target.id)
    data.set('title', (title.trim() === '' ? chosen.name : title.trim()).slice(0, TITLE_MAX))
    data.set('filename', chosen.name)
    data.set('contentType', chosen.type)
    data.set('sizeBytes', String(chosen.size))
    for (const [key, value] of Object.entries(extraFields)) data.set(key, value)
    return data
  }

  const run = async (chosen: File) => {
    const intent = await actions.createIntent(intentForm(chosen))
    if (!intent.ok) return setMessage(intent.error)
    setProgress(0)
    const sent = await put(intent.url, intent.headers, chosen, setProgress)
    if (!sent) return setMessage('The file could not be sent. Check your connection and try again.')
    const done = new FormData()
    done.set('csrf_token', csrf)
    done.set('intentId', intent.intentId)
    for (const [key, value] of Object.entries(extraFields)) done.set(key, value)
    const finalized = await actions.finalize(done)
    if (!finalized.ok) return setMessage(finalized.error)
    setMessage(UPLOADED)
    toast.success(UPLOADED)
    setFile(null)
    setPickerKey((key) => key + 1)
    setTitle('')
    onUploaded(finalized.documentId)
  }

  const submit = async () => {
    setMessage(null)
    if (file === null) return setMessage('Choose a file first.')
    if (file.size === 0) return setMessage('That file is empty. Choose a file with content.')
    if (file.size > maxBytes) return setMessage(tooLargeCopy(maxBytes))
    setMessage(null)
    const result = await attempt(() => run(file), setPending)
    if (!result.ok) setMessage(result.error)
    setProgress(null)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={fileId} className="text-base font-medium">
          {fileLabel}
        </Label>
        <FilePicker
          key={pickerKey}
          id={fileId}
          accept={accept}
          {...(capture === undefined ? {} : { capture })}
          onFilesChange={(files) => {
            setFile(files[0] ?? null)
            setMessage(null)
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={titleId} className="text-base font-medium">
          Name for this document
        </Label>
        <Input
          id={titleId}
          value={title}
          maxLength={TITLE_MAX}
          className="min-h-11 text-base"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={() => void submit()}
        >
          Upload
        </Button>
        {progress === null ? null : <p className="m-0 text-base">{`Sending ${progress}%`}</p>}
        {message === null ? null : (
          <p role="status" className="m-0 text-base">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
