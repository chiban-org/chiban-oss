'use client'

import { useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RecordRef } from '@/features/documents/types'
import { attempt } from '@/lib/attempt'

export type IntentResult =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }
export type FinalizeResult = { ok: true } | { ok: false; error: string }

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
  onUploaded: () => void
  put?: PutFile
  extraFields?: Record<string, string>
  accept?: string
  capture?: 'environment' | 'user'
  fileLabel?: string
}

const BYTES_PER_MB = 1024 * 1024
const PERCENT = 100

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
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const intentForm = (chosen: File): FormData => {
    const data = new FormData()
    data.set('csrf_token', csrf)
    data.set('targetKind', target.kind)
    data.set('targetId', target.id)
    data.set('title', title.trim() === '' ? chosen.name : title.trim())
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
    const finalized = await actions.finalize(done)
    if (!finalized.ok) return setMessage(finalized.error)
    setMessage('Uploaded.')
    setFile(null)
    setTitle('')
    onUploaded()
  }

  const submit = async () => {
    if (file === null) return setMessage('Choose a file first.')
    if (file.size > maxBytes) return setMessage(tooLargeCopy(maxBytes))
    setMessage(null)
    const result = await attempt(() => run(file), setPending)
    if (!result.ok) setMessage(result.error)
    setProgress(null)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="upload-file" className="text-base font-medium">
          {fileLabel}
        </Label>
        <Input
          id="upload-file"
          type="file"
          accept={accept}
          {...(capture === undefined ? {} : { capture })}
          className="min-h-11 text-base"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="upload-title" className="text-base font-medium">
          Name for this document
        </Label>
        <Input
          id="upload-title"
          value={title}
          className="min-h-11 text-base"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="min-h-11" disabled={pending} onClick={() => void submit()}>
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
