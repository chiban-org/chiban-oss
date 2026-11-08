'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import {
  type BoardDay,
  type BoardRequest,
  ScheduleBoard,
  type ScheduleChoice,
} from '@/components/inspections/ScheduleBoard'
import { attempt } from '@/lib/attempt'
import type { ActionResult } from '@/server/actionRunner'

export function ScheduleBoardClient({
  requests,
  days,
  today,
  takeRequest,
  scheduleAction,
  initialChosenId = null,
}: {
  requests: BoardRequest[]
  days: BoardDay[]
  today: string
  takeRequest: ReactNode
  scheduleAction: (formData: FormData) => Promise<ActionResult>
  initialChosenId?: string | null
}) {
  const csrf = useCsrfToken()
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)

  const schedule = async (choice: ScheduleChoice): Promise<boolean> => {
    const data = new FormData()
    data.set('csrf_token', csrf)
    data.set('inspectionId', choice.inspectionId)
    data.set('inspectorUserId', choice.inspectorUserId)
    data.set('date', choice.date)
    data.set('startMinute', String(choice.startMinute))
    data.set('expectedRowVersion', String(choice.rowVersion))
    const result = await attempt(
      () => scheduleAction(data),
      () => undefined,
    )
    if (!result.ok) {
      setMessage(result.error)
      return false
    }
    setMessage(result.value.ok ? result.value.message : result.value.error)
    router.refresh()
    return result.value.ok
  }

  return (
    <ScheduleBoard
      requests={requests}
      days={days}
      today={today}
      takeRequest={takeRequest}
      message={message}
      onSchedule={schedule}
      initialChosenId={initialChosenId}
    />
  )
}
