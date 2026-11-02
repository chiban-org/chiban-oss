'use client'

import { Check, FieldError, type FieldErrors, Input } from '@/components/config/primitives'
import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'

interface Props {
  body: InspectionSettingsBody
  onChange: (next: InspectionSettingsBody) => void
  errors: FieldErrors
}

type Weekday = InspectionSettingsBody['schedulingDays'][number]

const WEEKDAYS: readonly (readonly [Weekday, string])[] = [
  [1, 'Monday'],
  [2, 'Tuesday'],
  [3, 'Wednesday'],
  [4, 'Thursday'],
  [5, 'Friday'],
  [6, 'Saturday'],
]

function toWholeNumber(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

function toClock(minute: number): string {
  const h = String(Math.floor(minute / 60)).padStart(2, '0')
  const m = String(minute % 60).padStart(2, '0')
  return `${h}:${m}`
}

function fromClock(raw: string): number {
  const [h, m] = raw.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function toggled(days: Weekday[], day: Weekday, on: boolean): Weekday[] {
  const next = on ? [...days, day] : days.filter((d) => d !== day)
  return [...new Set(next)].sort()
}

export function InspectionSettingsEditor({ body, onChange, errors }: Props) {
  const phone = body.phoneRequestHours
  return (
    <div className="space-y-3">
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Inspection days</legend>
        <div className="grid grid-cols-3 gap-2">
          {WEEKDAYS.map(([day, label]) => (
            <Check
              key={day}
              label={label}
              checked={body.schedulingDays.includes(day)}
              onChange={(e) =>
                onChange({
                  ...body,
                  schedulingDays: toggled(body.schedulingDays, day, e.target.checked),
                })
              }
            />
          ))}
        </div>
        <FieldError errors={errors} name="schedulingDays" />
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Input
            label="First slot starts"
            type="time"
            value={toClock(body.windowStartMinute)}
            onChange={(e) => onChange({ ...body, windowStartMinute: fromClock(e.target.value) })}
          />
          <FieldError errors={errors} name="windowStartMinute" />
        </div>
        <div>
          <Input
            label="Last slot ends"
            type="time"
            value={toClock(body.windowEndMinute)}
            onChange={(e) => onChange({ ...body, windowEndMinute: fromClock(e.target.value) })}
          />
          <FieldError errors={errors} name="windowEndMinute" />
        </div>
        <div>
          <Input
            label="Slot length in minutes"
            type="number"
            min={15}
            max={240}
            value={body.slotMinutes}
            onChange={(e) => onChange({ ...body, slotMinutes: toWholeNumber(e.target.value) })}
          />
          <FieldError errors={errors} name="slotMinutes" />
        </div>
        <div>
          <Input
            label="Most inspections per inspector per day"
            type="number"
            min={1}
            value={body.maxPerInspectorPerDay}
            onChange={(e) =>
              onChange({ ...body, maxPerInspectorPerDay: toWholeNumber(e.target.value) })
            }
          />
          <FieldError errors={errors} name="maxPerInspectorPerDay" />
        </div>
        <div>
          <Input
            label="Days of notice before the first slot"
            type="number"
            min={0}
            value={body.minNoticeDays}
            onChange={(e) => onChange({ ...body, minNoticeDays: toWholeNumber(e.target.value) })}
          />
          <FieldError errors={errors} name="minNoticeDays" />
        </div>
        <div>
          <Input
            label="Days ahead that can be booked"
            type="number"
            min={1}
            value={body.horizonDays}
            onChange={(e) => onChange({ ...body, horizonDays: toWholeNumber(e.target.value) })}
          />
          <FieldError errors={errors} name="horizonDays" />
        </div>
      </div>
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Phone request hours</legend>
        <div className="grid grid-cols-3 gap-2">
          {WEEKDAYS.map(([day, label]) => (
            <Check
              key={day}
              label={label}
              checked={phone.days.includes(day)}
              onChange={(e) =>
                onChange({
                  ...body,
                  phoneRequestHours: { ...phone, days: toggled(phone.days, day, e.target.checked) },
                })
              }
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Input
            label="Phone line opens"
            type="time"
            value={toClock(phone.startMinute)}
            onChange={(e) =>
              onChange({
                ...body,
                phoneRequestHours: { ...phone, startMinute: fromClock(e.target.value) },
              })
            }
          />
          <Input
            label="Phone line closes"
            type="time"
            value={toClock(phone.endMinute)}
            onChange={(e) =>
              onChange({
                ...body,
                phoneRequestHours: { ...phone, endMinute: fromClock(e.target.value) },
              })
            }
          />
        </div>
        <FieldError errors={errors} name="phoneRequestHours" />
      </fieldset>
      <Check
        label="Residents can request inspections online"
        checked={body.portalRequestsEnabled}
        onChange={(e) => onChange({ ...body, portalRequestsEnabled: e.target.checked })}
      />
    </div>
  )
}
