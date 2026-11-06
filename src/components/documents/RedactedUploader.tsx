'use client'

import { useRouter } from 'next/navigation'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'
import type { RecordRef } from '@/features/documents/types'

interface Props {
  documentId: string
  target: RecordRef
  actions: UploaderActions
  seriesKey?: string | undefined
}

const MAX_BYTES = 100 * 1024 * 1024

export function RedactedUploader({ documentId, target, actions, seriesKey }: Props) {
  const router = useRouter()
  const finalize: UploaderActions['finalize'] = async (formData) => {
    formData.set('documentId', documentId)
    return await actions.finalize(formData)
  }
  return (
    <details>
      <summary>Upload redacted copy</summary>
      <Uploader
        target={target}
        maxBytes={MAX_BYTES}
        actions={{ createIntent: actions.createIntent, finalize }}
        extraFields={seriesKey === undefined ? {} : { seriesKey }}
        onUploaded={() => router.refresh()}
      />
    </details>
  )
}
