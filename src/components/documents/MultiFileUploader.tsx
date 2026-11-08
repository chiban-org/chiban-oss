'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { putWithProgress, type UploaderActions } from '@/components/documents/Uploader'
import { FilePicker } from '@/components/ui/file-picker'
import { Label } from '@/components/ui/label'
import { DEFAULT_UPLOAD_ACCEPT, TITLE_MAX } from '@/features/documents/uploadLimits'
import { attempt } from '@/lib/attempt'

interface Props {
  applicationId: string
  maxBytes: number
  actions: UploaderActions
}

export function MultiFileUploader({ applicationId, maxBytes, actions }: Props) {
  const router = useRouter()
  const csrf = useCsrfToken()
  const id = useId()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pickerKey, setPickerKey] = useState(0)

  const sendOne = async (file: File): Promise<string | null> => {
    if (file.size === 0 || file.size > maxBytes) return `${file.name} could not be added.`
    const intent = new FormData()
    intent.set('csrf_token', csrf)
    intent.set('targetKind', 'application')
    intent.set('targetId', applicationId)
    intent.set('title', file.name.slice(0, TITLE_MAX))
    intent.set('filename', file.name)
    intent.set('contentType', file.type)
    intent.set('sizeBytes', String(file.size))
    const made = await actions.createIntent(intent)
    if (!made.ok) return made.error
    if (!(await putWithProgress(made.url, made.headers, file, () => undefined))) {
      return `${file.name} could not be sent.`
    }
    const done = new FormData()
    done.set('csrf_token', csrf)
    done.set('intentId', made.intentId)
    const finalized = await actions.finalize(done)
    return finalized.ok ? null : finalized.error
  }

  const sendAll = async (files: File[]) => {
    setMessage(null)
    const result = await attempt(async () => {
      const problems: string[] = []
      for (const file of files) {
        const problem = await sendOne(file)
        if (problem !== null) problems.push(problem)
      }
      return problems
    }, setPending)
    const problems = result.ok ? result.value : [result.error]
    setMessage(
      problems.length === 0
        ? 'Added. Assign each file to the document it belongs to.'
        : problems.join(' '),
    )
    setPickerKey((key) => key + 1)
    router.refresh()
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-base font-medium">
        Add other files
      </Label>
      <FilePicker
        key={pickerKey}
        id={id}
        accept={DEFAULT_UPLOAD_ACCEPT}
        multiple
        disabled={pending}
        onFilesChange={(files) => {
          if (files.length > 0) void sendAll(files)
        }}
      />
      {message === null ? null : (
        <p role="status" className="m-0 text-base">
          {message}
        </p>
      )}
    </div>
  )
}
