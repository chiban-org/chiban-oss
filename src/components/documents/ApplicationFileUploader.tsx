'use client'

import { useRouter } from 'next/navigation'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'

interface Props {
  applicationId: string
  fileLabel: string
  actions: UploaderActions
}

const MAX_BYTES = 100 * 1024 * 1024

export function ApplicationFileUploader({ applicationId, fileLabel, actions }: Props) {
  const router = useRouter()
  return (
    <Uploader
      target={{ kind: 'application', id: applicationId }}
      maxBytes={MAX_BYTES}
      actions={actions}
      fileLabel={fileLabel}
      onUploaded={() => router.refresh()}
    />
  )
}
