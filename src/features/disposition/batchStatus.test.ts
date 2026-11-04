import { describe, expect, it } from 'vitest'
import { BATCH_CHIP, BATCH_STATUS_LABELS } from '@/features/disposition/batchStatus'

describe('batch status', () => {
  it('labels and colors every batch status, with only a carried out batch shown as passed', () => {
    expect(Object.keys(BATCH_CHIP).sort()).toEqual(Object.keys(BATCH_STATUS_LABELS).sort())
    const passed = Object.entries(BATCH_CHIP).filter(([, chip]) => chip === 'passed')
    expect(passed).toEqual([['executed', 'passed']])
  })
})
