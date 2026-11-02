'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'
import { Label } from '@/components/ui/label'

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
        <select
          id="upload-kind"
          value={docKind}
          onChange={(e) => setDocKind(e.target.value)}
          className="block min-h-11 w-full rounded-md border bg-surface px-3 py-2 text-base"
        >
          {kinds.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
