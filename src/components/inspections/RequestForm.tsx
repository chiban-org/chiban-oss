'use client'

import { ActionForm } from '@/components/ActionForm'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { RequiredMark } from '@/components/ui/required-mark'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatCivilDate } from '@/lib/formatDate'
import type { ActionResult } from '@/server/actionRunner'

export interface RequestFormType {
  checklistVersionId: string
  label: string
}

const NO_PREFERENCE = 'any'

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
}) {
  const first = channels[0]
  return (
    <ActionForm action={action} submitLabel={submitLabel} variant="default">
      <input type="hidden" name="applicationId" value={applicationId} />
      {reinspectionOf === undefined ? null : (
        <input type="hidden" name="reinspectionOf" value={reinspectionOf} />
      )}
      {channels.length > 1 ? (
        <fieldset className="space-y-2 border-0 p-0">
          <legend className="font-medium">How the request came in</legend>
          <RadioGroup name="channel" defaultValue={first?.value} className="gap-1">
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
      {outsidePhoneHours ? (
        <p role="note" className="m-0 rounded-md bg-highlight px-3 py-2">
          <strong>Phone request hours</strong>
          {`: ${phoneHoursText}. You can still take this request now.`}
        </p>
      ) : (
        <p className="m-0">{`Phone request hours: ${phoneHoursText}.`}</p>
      )}
      <fieldset className="space-y-2 border-0 p-0">
        <legend className="font-medium">Inspection</legend>
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
                {formatCivilDate(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contactName" className="text-base font-medium">
          <span>
            Contact name
            <RequiredMark />
          </span>
        </Label>
        <Input
          id="contactName"
          name="contactName"
          required
          className="min-h-11 text-base md:text-base"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contactPhone" className="text-base font-medium">
          Contact phone
        </Label>
        <Input
          id="contactPhone"
          name="contactPhone"
          type="tel"
          className="min-h-11 text-base md:text-base"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="accessNotes" className="text-base font-medium">
          Access notes
        </Label>
        <Textarea id="accessNotes" name="accessNotes" className="min-h-20 text-base" />
      </div>
    </ActionForm>
  )
}
