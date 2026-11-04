'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

export function CaseUploader({
  caseId,
  kinds,
  actions,
  maxBytes,
}: {
  caseId: string
  kinds: [string, string][]
  actions: UploaderActions
  maxBytes: number
}) {
  const router = useRouter()
  const [docKind, setDocKind] = useState(kinds[0]?.[0] ?? '')
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="upload-kind" className="text-base font-medium">
          What kind of document
        </Label>
        <NativeSelect
          id="upload-kind"
          value={docKind}
          onChange={(e) => setDocKind(e.target.value)}
          className="min-h-11 text-base md:text-base"
        >
          {kinds.map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Uploader
        target={{ kind: 'enforcement_case', id: caseId }}
        maxBytes={maxBytes}
        actions={actions}
        extraFields={{ docKind }}
        onUploaded={() => router.refresh()}
      />
    </div>
  )
}
