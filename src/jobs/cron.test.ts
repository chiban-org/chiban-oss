import { describe, expect, it } from 'vitest'
import { AppError } from '@/constants/errorIds'
import { cronForInterval } from '@/jobs/cron'

describe('cronForInterval', () => {
  it('maps minute intervals that divide the hour', () => {
    expect(cronForInterval(60)).toBe('* * * * *')
    expect(cronForInterval(300)).toBe('*/5 * * * *')
    expect(cronForInterval(900)).toBe('*/15 * * * *')
  })

  it('maps hour intervals', () => {
    expect(cronForInterval(3600)).toBe('0 * * * *')
    expect(cronForInterval(6 * 3600)).toBe('0 */6 * * *')
  })

  it('rejects intervals that cron cannot express', () => {
    expect(() => cronForInterval(90)).toThrow(AppError)
    expect(() => cronForInterval(7 * 60)).toThrow(AppError)
  })
})
