'use client'

import { useRouter } from 'next/navigation'
import { useCsrfToken } from '@/components/CsrfProvider'
import type { ChecklistAction } from '@/components/documents/checklistTypes'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'

interface Props {
  applicationId: string
  itemKey: string
  label: string
  maxBytes: number
  actions: UploaderActions
  replaces?: { documentIds: string[]; unlink: ChecklistAction }
}

export function ItemUploader({
  applicationId,
  itemKey,
  label,
  maxBytes,
  actions,
  replaces,
}: Props) {
  const router = useRouter()
  const csrf = useCsrfToken()
  const unlinkReplaced = async (keep: string | undefined) => {
    for (const documentId of replaces?.documentIds ?? []) {
      if (documentId === keep) continue
      const data = new FormData()
      data.set('csrf_token', csrf)
      data.set('applicationId', applicationId)
      data.set('itemKey', itemKey)
      data.set('documentId', documentId)
      await replaces?.unlink(data)
    }
  }
  return (
    <Uploader
      target={{ kind: 'application', id: applicationId }}
      maxBytes={maxBytes}
      actions={actions}
      extraFields={{ itemKey }}
      fixedTitle={label}
      uploadOnChoose
      fileLabel={replaces === undefined ? `Choose a file for ${label}` : `Replace ${label}`}
      chooseLabel={replaces === undefined ? 'Choose file' : 'Choose a new file'}
      onUploaded={(documentId) => {
        void unlinkReplaced(documentId).then(() => router.refresh())
      }}
    />
  )
}
