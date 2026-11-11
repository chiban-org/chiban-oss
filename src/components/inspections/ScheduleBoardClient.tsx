'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { type FieldErrorMap, FieldErrorsProvider } from '@/components/fieldErrors'
import type {
  BoardBooking,
  BoardDay,
  BoardInspector,
  BoardRequest,
  ScheduleChoice,
} from '@/components/inspections/boardTypes'
import { ScheduleBoard } from '@/components/inspections/ScheduleBoard'
import { attempt } from '@/lib/attempt'
import type { ActionResult } from '@/server/actionRunner'

export function ScheduleBoardClient({
  requests,
  bookings,
  days,
  inspectors,
  today,
  takeRequest,
  scheduleAction,
  initialChosenId = null,
}: {
  requests: BoardRequest[]
  bookings: BoardBooking[]
  days: BoardDay[]
  inspectors: BoardInspector[]
  today: string
  takeRequest: ReactNode
  scheduleAction: (formData: FormData) => Promise<ActionResult>
  initialChosenId?: string | null
}) {
  const csrf = useCsrfToken()
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})

  const schedule = async (choice: ScheduleChoice): Promise<boolean> => {
    const data = new FormData()
    data.set('csrf_token', csrf)
    data.set('inspectionId', choice.inspectionId)
    data.set('inspectorUserId', choice.inspectorUserId)
    data.set('date', choice.date)
    data.set('startMinute', String(choice.startMinute))
    data.set('expectedRowVersion', String(choice.rowVersion))
    const reason = choice.offGridReason?.trim() ?? ''
    if (reason !== '') data.set('offGridReason', reason)
    const result = await attempt(
      () => scheduleAction(data),
      () => undefined,
    )
    if (!result.ok) {
      setMessage(result.error)
      return false
    }
    setMessage(result.value.ok ? result.value.message : result.value.error)
    setFieldErrors(result.value.ok ? {} : (result.value.fieldErrors ?? {}))
    router.refresh()
    return result.value.ok
  }

  return (
    <FieldErrorsProvider errors={fieldErrors}>
      <ScheduleBoard
        requests={requests}
        bookings={bookings}
        days={days}
        inspectors={inspectors}
        today={today}
        takeRequest={takeRequest}
        message={message}
        onSchedule={schedule}
        initialChosenId={initialChosenId}
      />
    </FieldErrorsProvider>
  )
}
