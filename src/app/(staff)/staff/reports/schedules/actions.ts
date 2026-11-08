'use server'

import type { ScheduleError } from '@/features/reports/scheduleInput'
import {
  createSchedule,
  deleteSchedule,
  setSchedulePaused,
  updateSchedule,
} from '@/features/reports/schedules'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { EDIT_SCHEDULE_FORM, SCHEDULE_FORM, SCHEDULE_ID_FORM } from './forms'

const FORBIDDEN = 'You do not have permission to schedule this report.'
const GONE = 'That schedule was not found. Someone may have deleted it.'

function refused(error: ScheduleError): ActionResult {
  if (error === 'forbidden') return { ok: false, error: FORBIDDEN }
  if (error === 'not_found') return { ok: false, error: GONE }
  return {
    ok: false,
    error: Object.values(error.invalid).join(' '),
    fieldErrors: error.invalid,
  }
}

export async function createScheduleAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SCHEDULE_FORM, async (ctx, input) => {
    const made = await createSchedule(ctx.db, ctx.actor, input, ctx.signal)
    return made.ok ? { ok: true, message: 'Report scheduled.' } : refused(made.error)
  })
}

export async function updateScheduleAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, EDIT_SCHEDULE_FORM, async (ctx, input) => {
    const { scheduleId, ...fields } = input
    const saved = await updateSchedule(ctx.db, ctx.actor, { id: scheduleId, ...fields }, ctx.signal)
    return saved.ok ? { ok: true, message: 'Schedule saved.' } : refused(saved.error)
  })
}

function pauseAction(paused: boolean, message: string) {
  return async (formData: FormData): Promise<ActionResult> =>
    await runStaffForm(formData, SCHEDULE_ID_FORM, async (ctx, input) => {
      const done = await setSchedulePaused(
        ctx.db,
        ctx.actor,
        { id: input.scheduleId, paused },
        ctx.signal,
      )
      return done.ok ? { ok: true, message } : refused(done.error)
    })
}

export async function pauseScheduleAction(formData: FormData): Promise<ActionResult> {
  return await pauseAction(true, 'Schedule paused.')(formData)
}

export async function resumeScheduleAction(formData: FormData): Promise<ActionResult> {
  return await pauseAction(false, 'Schedule resumed.')(formData)
}

export async function deleteScheduleAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SCHEDULE_ID_FORM, async (ctx, input) => {
    const done = await deleteSchedule(ctx.db, ctx.actor, { id: input.scheduleId }, ctx.signal)
    return done.ok ? { ok: true, message: 'Schedule deleted.' } : refused(done.error)
  })
}
