import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  DEFAULT_MEETING_START_MINUTE,
  meetingStartTime,
  minuteToTimeInput,
} from '@/features/boards/meetingTime'

function verdict(schema: z.ZodType, raw: unknown) {
  const parsed = schema.safeParse(raw)
  return parsed.success ? { value: parsed.data } : { message: parsed.error.issues[0]?.message }
}

describe('meetingStartTime', () => {
  const startsAt = meetingStartTime('the start time')

  it('reads a time box value as minutes after midnight', () => {
    expect(verdict(startsAt, '19:00')).toEqual({ value: 1140 })
    expect(verdict(startsAt, '06:30')).toEqual({ value: 390 })
    expect(verdict(startsAt, '00:00')).toEqual({ value: 0 })
    expect(verdict(startsAt, '23:59')).toEqual({ value: 1439 })
  })

  it('accepts the seconds some browsers add', () => {
    expect(verdict(startsAt, '18:45:00')).toEqual({ value: 1125 })
  })

  it('uses the usual 7:00 PM start when no time is sent', () => {
    expect(verdict(startsAt, '')).toEqual({ value: 1140 })
    expect(verdict(startsAt, undefined)).toEqual({ value: 1140 })
  })

  it('refuses words and impossible times', () => {
    for (const raw of ['noon', '24:00', '19:60', '7pm', '1900'])
      expect(verdict(startsAt, raw)).toEqual({
        message: 'Enter the start time as a time of day, like 7:00 PM.',
      })
  })
})

describe('minuteToTimeInput', () => {
  it('writes minutes as a time box value', () => {
    expect(minuteToTimeInput(DEFAULT_MEETING_START_MINUTE)).toBe('19:00')
    expect(minuteToTimeInput(390)).toBe('06:30')
  })
})
