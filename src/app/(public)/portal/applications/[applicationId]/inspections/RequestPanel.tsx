'use client'

import { useState } from 'react'
import { RequestForm, type RequestFormType } from '@/components/inspections/RequestForm'
import { portalRequestInspectionAction } from './actions'

export function RequestPanel(props: {
  applicationId: string
  types: RequestFormType[]
  reinspectionOf: string | null
  dates: string[]
  phoneHoursText: string
  contact: { name: string; phone: string }
  startOpen: boolean
}) {
  const [open, setOpen] = useState(props.startOpen)
  const [round, setRound] = useState(0)
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="tap-target inline-flex cursor-pointer items-center">
        <h2 className="m-0 inline">Request an inspection</h2>
      </summary>
      <div className="max-w-xl pt-4">
        <RequestForm
          key={round}
          applicationId={props.applicationId}
          types={props.types}
          {...(props.reinspectionOf === null ? {} : { reinspectionOf: props.reinspectionOf })}
          dates={props.dates}
          action={portalRequestInspectionAction}
          channels={[{ value: 'portal', label: 'Online' }]}
          phoneHoursText={props.phoneHoursText}
          outsidePhoneHours={false}
          contact={props.contact}
          showPhoneHours={false}
          weekdays
          onRequested={() => {
            setOpen(false)
            setRound((n) => n + 1)
          }}
        />
      </div>
    </details>
  )
}
