import { describe, expect, it } from 'vitest'
import {
  dueFor,
  type FocusRow,
  inspectionName,
  inspectorSentence,
  lastResult,
  nextScheduled,
} from './inspectorFocus'

const ME = 'user-ira'

function row(over: Partial<FocusRow> & { id: string }): FocusRow {
  return {
    status: 'scheduled',
    inspectionType: 'framing',
    reinspectionOf: null,
    inspectorUserId: ME,
    scheduledDate: '2026-11-06',
    startMinute: 630,
    resultRecordedAt: null,
    ...over,
  }
}

const failed = row({
  id: 'a',
  status: 'failed',
  scheduledDate: '2026-11-04',
  startMinute: 570,
  resultRecordedAt: new Date('2026-11-04T21:00:00Z'),
})
const reinspection = row({ id: 'b', reinspectionOf: 'a' })
const insulation = row({
  id: 'c',
  inspectionType: 'insulation',
  scheduledDate: '2026-11-30',
  startMinute: 690,
})

describe('the inspection an inspector works next', () => {
  it('picks the earliest scheduled inspection, an owed result first', () => {
    const owed = row({ id: 'd', scheduledDate: '2026-11-02', startMinute: 540 })
    expect(nextScheduled([failed, insulation, reinspection])?.id).toBe('b')
    expect(nextScheduled([failed, insulation, reinspection, owed])?.id).toBe('d')
    expect(nextScheduled([failed])).toBeNull()
  })

  it('names a reinspection as one', () => {
    expect(inspectionName(reinspection)).toBe('Framing reinspection')
    expect(inspectionName(insulation)).toBe('Insulation inspection')
  })

  it('takes the most recently recorded result as the last one', () => {
    const passed = row({
      id: 'e',
      status: 'passed',
      inspectionType: 'footing',
      resultRecordedAt: new Date('2026-10-01T21:00:00Z'),
    })
    expect(lastResult([passed, failed, reinspection])?.id).toBe('a')
    expect(lastResult([reinspection])).toBeNull()
  })
})

describe('the status sentence on the inspection view', () => {
  const base = { today: '2026-11-06', viewerId: ME, inspectorName: 'Ira Inspector' }

  it('says the viewer has an inspection today and when', () => {
    expect(inspectorSentence({ ...base, rows: [failed, reinspection, insulation] })).toBe(
      'Waiting on: Inspector (you). Framing reinspection today at 10:30 AM.',
    )
  })

  it('names another inspector and a later date', () => {
    expect(
      inspectorSentence({
        ...base,
        viewerId: 'someone-else',
        rows: [failed, insulation],
      }),
    ).toBe(
      'Waiting on: Inspector (Ira Inspector). Insulation inspection on November 30, 2026 at 11:30 AM.',
    )
  })

  it('says a past inspection still needs its result', () => {
    expect(
      inspectorSentence({ ...base, rows: [row({ id: 'f', scheduledDate: '2026-11-02' })] }),
    ).toBe(
      'Waiting on: Inspector (you). Framing inspection from November 2, 2026 needs its result.',
    )
  })

  it('says a scheduled inspection without a date has none yet', () => {
    expect(
      inspectorSentence({
        ...base,
        rows: [row({ id: 'h', scheduledDate: null, startMinute: null })],
      }),
    ).toBe('Waiting on: Inspector (you). Framing inspection has no date yet.')
  })

  it('points a request with no date at the town', () => {
    const requested = row({
      id: 'g',
      status: 'requested',
      inspectionType: 'final',
      scheduledDate: null,
      startMinute: null,
      inspectorUserId: null,
    })
    expect(inspectorSentence({ ...base, inspectorName: null, rows: [failed, requested] })).toBe(
      'Waiting on: Town. Schedule the Final inspection.',
    )
  })

  it('says plainly when nothing is scheduled or requested', () => {
    expect(inspectorSentence({ ...base, inspectorName: null, rows: [failed] })).toBe(
      'No inspection is scheduled or requested.',
    )
  })
})

describe('the inspection that is due for one viewer', () => {
  const TODAY = '2026-11-06'
  const mine = row({ id: 'm', scheduledDate: TODAY })
  const others = row({ id: 'o', inspectorUserId: 'user-dana', scheduledDate: '2026-11-05' })
  const later = row({ id: 'l', scheduledDate: '2026-11-09' })
  const owed = row({ id: 'w', scheduledDate: '2026-11-03', startMinute: 540 })

  it('takes the viewer own scheduled inspection on or before today', () => {
    expect(dueFor([mine, others, later], ME, TODAY)?.id).toBe('m')
  })

  it('leads with an owed result before today', () => {
    expect(dueFor([mine, owed], ME, TODAY)?.id).toBe('w')
  })

  it('ignores other inspectors, future dates, recorded results and unassigned rows', () => {
    expect(dueFor([others, later, failed], ME, TODAY)).toBeNull()
    expect(dueFor([row({ id: 'u', inspectorUserId: null })], ME, TODAY)).toBeNull()
    expect(dueFor([row({ id: 'n', scheduledDate: null })], ME, TODAY)).toBeNull()
  })
})
