'use client'

import { useRouter } from 'next/navigation'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'

const MAX_BYTES = 100 * 1024 * 1024

export function MinutesUploader({
  meetingId,
  actions,
}: {
  meetingId: string
  actions: UploaderActions
}) {
  const router = useRouter()
  return (
    <Uploader
      target={{ kind: 'meeting', id: meetingId }}
      maxBytes={MAX_BYTES}
      actions={actions}
      fileLabel="Upload the minutes"
      onUploaded={() => router.refresh()}
    />
  )
}
