'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  parcelId: string
  series: { key: string; label: string; citation: string }[]
  actions: UploaderActions
}

const MAX_BYTES = 100 * 1024 * 1024

export function ParcelFileUploader({ parcelId, series, actions }: Props) {
  const router = useRouter()
  const [seriesKey, setSeriesKey] = useState('')
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="parcel-series" className="text-base font-medium">
          Record series
        </Label>
        <Select value={seriesKey} onValueChange={setSeriesKey}>
          <SelectTrigger id="parcel-series" className="min-h-11 w-full text-base">
            <SelectValue placeholder="Choose the record series" />
          </SelectTrigger>
          <SelectContent>
            {series.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {`${s.label} (${s.citation})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {seriesKey === '' ? (
        <p role="note">Choose a record series before uploading a parcel file.</p>
      ) : (
        <Uploader
          target={{ kind: 'parcel', id: parcelId }}
          maxBytes={MAX_BYTES}
          actions={actions}
          extraFields={{ seriesKey }}
          onUploaded={() => router.refresh()}
        />
      )}
    </div>
  )
}
