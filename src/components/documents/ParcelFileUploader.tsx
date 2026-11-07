'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  defaultParcelFileVisibility,
  type ParcelFileVisibility,
} from '@/features/documents/parcelVisibility'

interface Props {
  parcelId: string
  series: { key: string; label: string; citation: string }[]
  actions: UploaderActions
}

const MAX_BYTES = 100 * 1024 * 1024
const VISIBILITY_CHOICES: [ParcelFileVisibility, string][] = [
  ['private', 'Town staff only, until someone approves a copy for the public'],
  ['public', 'The public site, as uploaded'],
]

export function ParcelFileUploader({ parcelId, series, actions }: Props) {
  const router = useRouter()
  const [seriesKey, setSeriesKey] = useState('')
  const [visibility, setVisibility] = useState<ParcelFileVisibility>('private')
  const chooseSeries = (key: string) => {
    setSeriesKey(key)
    setVisibility(defaultParcelFileVisibility(key))
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="parcel-series" className="text-base font-medium">
          Record series
        </Label>
        <Select value={seriesKey} onValueChange={chooseSeries}>
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
        <>
          <fieldset className="space-y-2 border-0 p-0">
            <legend className="text-base font-medium">Who can see this file</legend>
            <RadioGroup
              name="parcel-visibility"
              value={visibility}
              onValueChange={(next) => setVisibility(next as ParcelFileVisibility)}
              className="gap-0"
            >
              {VISIBILITY_CHOICES.map(([value, label]) => (
                <div key={value} className="flex min-h-11 items-center gap-2">
                  <RadioGroupItem id={`parcel-visibility-${value}`} value={value} />
                  <Label htmlFor={`parcel-visibility-${value}`} className="text-base font-normal">
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-muted-foreground">
              A file shown on the public site appears on this parcel's public page, where anyone can
              download it.
            </p>
          </fieldset>
          <Uploader
            target={{ kind: 'parcel', id: parcelId }}
            maxBytes={MAX_BYTES}
            actions={actions}
            extraFields={{ seriesKey, visibility }}
            onUploaded={() => router.refresh()}
          />
        </>
      )}
    </div>
  )
}
