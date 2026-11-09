'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { useTaken } from '@/components/inspections/takeRequestContext'
import { AreaField, TextField } from '@/components/staff/fields'
import { Label } from '@/components/ui/label'
import { Legend } from '@/components/ui/legend'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACCESS_NOTES_MAX, CONTACT_NAME_MAX } from '@/features/inspections/portalRequestForm'
import { formatCivilDate, formatCivilDateWithWeekday } from '@/lib/formatDate'
import type { ActionResult } from '@/server/actionRunner'

export interface RequestFormType {
  checklistVersionId: string
  label: string
}

const NO_PREFERENCE = 'any'

function HoursNote({
  text,
  choice,
  outside,
  single,
  shown,
}: {
  text: string
  choice: string | undefined
  outside: boolean
  single: boolean
  shown: boolean
}) {
  if (!shown) return null
  if (single) return <p className="m-0">{`Phone request hours: ${text}.`}</p>
  if (choice !== 'phone' || !outside) return null
  return (
    <p role="note" className="m-0 rounded-md bg-highlight px-3 py-2">
      <strong>Phone request hours</strong>
      {`: ${text}. You can still take this request now.`}
    </p>
  )
}

export function RequestForm({
  applicationId,
  types,
  dates,
  action,
  channels,
  phoneHoursText,
  outsidePhoneHours,
  reinspectionOf,
  submitLabel = 'Request inspection',
  submitVariant = 'default',
  contact,
  showPhoneHours = true,
  weekdays = false,
  onRequested,
}: {
  applicationId: string
  types: RequestFormType[]
  dates: string[]
  action: (formData: FormData) => Promise<ActionResult>
  channels: { value: 'phone' | 'counter' | 'portal'; label: string }[]
  phoneHoursText: string
  outsidePhoneHours: boolean
  reinspectionOf?: string
  submitLabel?: string
  submitVariant?: 'default' | 'outline'
  contact?: { name: string; phone: string }
  showPhoneHours?: boolean
  weekdays?: boolean
  onRequested?: () => void
}) {
  const first = channels[0]
  const [channel, setChannel] = useState(first?.value)
  const taken = useTaken()
  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      variant={submitVariant}
      onSuccess={(result) => {
        taken(result)
        onRequested?.()
      }}
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      {reinspectionOf === undefined ? null : (
        <input type="hidden" name="reinspectionOf" value={reinspectionOf} />
      )}
      {channels.length > 1 ? (
        <fieldset className="space-y-2 border-0 p-0">
          <legend className="font-medium">How the request came in</legend>
          <RadioGroup
            name="channel"
            value={channel}
            onValueChange={(next) => setChannel(next as 'phone' | 'counter' | 'portal')}
            className="gap-1"
          >
            {channels.map((c) => (
              <div key={c.value} className="flex min-h-11 items-center gap-3">
                <RadioGroupItem id={`channel-${c.value}`} value={c.value} />
                <Label htmlFor={`channel-${c.value}`} className="text-base">
                  {c.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      ) : (
        <input type="hidden" name="channel" value={first?.value ?? 'portal'} />
      )}
      <HoursNote
        text={phoneHoursText}
        choice={channel}
        outside={outsidePhoneHours}
        single={channels.length < 2}
        shown={showPhoneHours}
      />
      <fieldset className="space-y-2 border-0 p-0">
        <Legend>Inspection</Legend>
        <RadioGroup
          name="checklistVersionId"
          defaultValue={types[0]?.checklistVersionId}
          className="gap-1"
        >
          {types.map((t) => (
            <div key={t.checklistVersionId} className="flex min-h-11 items-center gap-3">
              <RadioGroupItem id={`type-${t.checklistVersionId}`} value={t.checklistVersionId} />
              <Label htmlFor={`type-${t.checklistVersionId}`} className="text-base">
                {t.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="preferredDate" className="text-base font-medium">
          Preferred day
        </Label>
        <Select name="preferredDate" defaultValue={NO_PREFERENCE}>
          <SelectTrigger id="preferredDate" className="min-h-11 w-full text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PREFERENCE}>No preference</SelectItem>
            {dates.map((d) => (
              <SelectItem key={d} value={d}>
                {weekdays ? formatCivilDateWithWeekday(d) : formatCivilDate(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TextField
        label="Contact name"
        name="contactName"
        required
        defaultValue={contact?.name}
        maxLength={CONTACT_NAME_MAX}
        className="min-h-11 text-base md:text-base"
      />
      <TextField
        label="Contact phone"
        name="contactPhone"
        type="tel"
        defaultValue={contact?.phone}
        className="min-h-11 text-base md:text-base"
      />
      <AreaField
        label="Access notes"
        name="accessNotes"
        maxLength={ACCESS_NOTES_MAX}
        className="min-h-20 text-base"
      />
    </ActionForm>
  )
}
