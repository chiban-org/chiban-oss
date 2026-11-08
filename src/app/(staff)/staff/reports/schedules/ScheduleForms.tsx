'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { CheckField, SelectField } from '@/components/staff/fields'
import { Legend } from '@/components/ui/legend'
import { createScheduleAction, updateScheduleAction } from './actions'

export interface ScheduleOptions {
  reports: { value: string; label: string; needs: string[] }[]
  frequencies: { value: string; label: string }[]
  people: { id: string; name: string; capabilities: string[] }[]
}

export interface ScheduleValues {
  report: string
  frequency: string
  recipientIds: string[]
}

const MONTHLY_ONLY = new Set(['census'])

function ScheduleFields({
  options,
  initial,
}: {
  options: ScheduleOptions
  initial: ScheduleValues
}) {
  const [report, setReport] = useState(initial.report)
  const needs = options.reports.find((r) => r.value === report)?.needs ?? []
  const frequencies = MONTHLY_ONLY.has(report)
    ? options.frequencies.filter((f) => f.value === 'monthly')
    : options.frequencies
  const frequency = frequencies.some((f) => f.value === initial.frequency)
    ? initial.frequency
    : (frequencies[0]?.value ?? '')
  return (
    <>
      <SelectField
        label="Report"
        name="report"
        required
        value={report}
        onChange={(e) => setReport(e.target.value)}
        options={options.reports.map((r) => [r.value, r.label] as const)}
      />
      <SelectField
        key={report}
        label="How often"
        name="frequency"
        required
        defaultValue={frequency}
        hint={
          MONTHLY_ONLY.has(report)
            ? 'The census report goes out monthly, for the month before.'
            : 'Each run covers the whole calendar week, month or quarter before it.'
        }
        options={frequencies.map((f) => [f.value, f.label] as const)}
      />
      <fieldset className="grid gap-2 border-0 p-0">
        <Legend>Send it to</Legend>
        <p className="m-0 text-sm text-muted-foreground">
          Each person gets the report as they would see it, as a CSV file and an Excel workbook.
        </p>
        {options.people.map((person) => {
          const allowed = needs.every((n) => person.capabilities.includes(n))
          return (
            <CheckField
              key={`${report}-${person.id}`}
              name="recipientIds"
              value={person.id}
              groupMember
              disabled={!allowed}
              defaultChecked={allowed && initial.recipientIds.includes(person.id)}
              label={allowed ? person.name : `${person.name} (cannot see this report)`}
            />
          )
        })}
      </fieldset>
    </>
  )
}

export function AddSchedule({ options }: { options: ScheduleOptions }) {
  const first = options.reports[0]?.value ?? ''
  return (
    <FormDialog
      label="Schedule a report"
      title="Schedule a report"
      description="Chiban emails the report early on each run day, in the town's time zone."
      variant="default"
    >
      <ActionForm
        action={createScheduleAction}
        submitLabel="Schedule report"
        closeOnSuccess
        className="max-w-xl"
      >
        <ScheduleFields
          options={options}
          initial={{ report: first, frequency: 'monthly', recipientIds: [] }}
        />
      </ActionForm>
    </FormDialog>
  )
}

export function EditSchedule({
  scheduleId,
  title,
  options,
  initial,
}: {
  scheduleId: string
  title: string
  options: ScheduleOptions
  initial: ScheduleValues
}) {
  return (
    <RowEditDialog record={title} title={`Edit ${title}`}>
      <ActionForm
        action={updateScheduleAction}
        submitLabel="Save changes"
        closeOnSuccess
        className="max-w-xl"
      >
        <input type="hidden" name="scheduleId" value={scheduleId} />
        <ScheduleFields options={options} initial={initial} />
      </ActionForm>
    </RowEditDialog>
  )
}
