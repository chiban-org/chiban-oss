'use client'

import { useRouter } from 'next/navigation'
import { Uploader } from '@/components/documents/Uploader'
import { createUploadIntentAction, finalizeUploadAction } from './uploadActions'

export function UploadSection({
  applicationId,
  maxBytes,
}: {
  applicationId: string
  maxBytes: number
}) {
  const router = useRouter()
  return (
    <Uploader
      target={{ kind: 'application', id: applicationId }}
      maxBytes={maxBytes}
      actions={{ createIntent: createUploadIntentAction, finalize: finalizeUploadAction }}
      onUploaded={() => router.refresh()}
    />
  )
}
