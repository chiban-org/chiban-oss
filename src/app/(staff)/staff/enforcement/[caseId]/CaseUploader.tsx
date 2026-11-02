'use client'

import { useRouter } from 'next/navigation'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'

export function CaseUploader({
  caseId,
  docKind,
  label,
  actions,
  maxBytes,
}: {
  caseId: string
  docKind: string
  label: string
  actions: UploaderActions
  maxBytes: number
}) {
  const router = useRouter()
  return (
    <Uploader
      target={{ kind: 'enforcement_case', id: caseId }}
      maxBytes={maxBytes}
      actions={actions}
      extraFields={{ docKind }}
      fileLabel={label}
      onUploaded={() => router.refresh()}
    />
  )
}
