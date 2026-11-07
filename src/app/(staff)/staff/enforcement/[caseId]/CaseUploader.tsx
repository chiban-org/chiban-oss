'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

function KindPicker({
  kinds,
  value,
  onChange,
}: {
  kinds: [string, string][]
  value: string
  onChange: (kind: string) => void
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-base font-medium">
        What kind of document
      </Label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 text-base md:text-base"
      >
        {kinds.map(([kind, label]) => (
          <NativeSelectOption key={kind} value={kind}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}

export function CaseUploader({
  caseId,
  kinds,
  actions,
  maxBytes,
  capture,
}: {
  caseId: string
  kinds: [string, string][]
  actions: UploaderActions
  maxBytes: number
  capture?: 'environment'
}) {
  const router = useRouter()
  const [docKind, setDocKind] = useState(kinds[0]?.[0] ?? '')
  return (
    <div className="space-y-3">
      {kinds.length > 1 ? <KindPicker kinds={kinds} value={docKind} onChange={setDocKind} /> : null}
      <Uploader
        target={{ kind: 'enforcement_case', id: caseId }}
        maxBytes={maxBytes}
        actions={actions}
        extraFields={{ docKind }}
        onUploaded={() => router.refresh()}
        {...(capture === undefined ? {} : { capture })}
      />
    </div>
  )
}
