import { describe, expect, it } from 'vitest'
import { MESSAGES } from '@/features/notifications/messages'
import { WORDING_KEY_INFO, WORDING_KEYS } from '@/features/notifications/wording/wordingKeys'
import { defaultWordingFor } from '@/features/notifications/wording/wordingStandard'
import { findIsoDates } from '@/test/leaks'

describe('moved inspection wording', () => {
  it('is a wording key with a label and the earlier date and time fields', () => {
    expect(WORDING_KEYS).toContain('inspection_rescheduled')
    expect(WORDING_KEY_INFO.inspection_rescheduled.label).toBe('Inspection moved')
    expect(WORDING_KEY_INFO.inspection_rescheduled.fields).toEqual(
      expect.arrayContaining(['inspection.previousDate', 'inspection.previousTime']),
    )
    expect(defaultWordingFor({ recordsRequest: 'records request' }).inspection_rescheduled).toEqual(
      {
        subject: 'Inspection moved: {{application.number}}, {{inspection.type}}',
        body: 'The {{inspection.type}} inspection for {{application.number}} has moved from {{inspection.previousDate}} at {{inspection.previousTime}} to {{inspection.date}} at {{inspection.time}}.',
      },
    )
  })

  it('renders the earlier and new times in words', () => {
    const rendered = MESSAGES.inspection_rescheduled({
      applicationId: 'a1',
      townName: 'Town of Fernhollow',
      payload: {
        number: 'BP-2027-0012',
        inspectionLabel: 'Footing',
        onDate: '2027-05-12',
        atTime: '1:30 PM',
        previousDate: '2027-05-10',
        previousTime: '9:00 AM',
      },
    })
    expect(rendered.subject).toBe('Inspection moved: BP-2027-0012, Footing')
    expect(rendered.text).toContain(
      'The Footing inspection for BP-2027-0012 has moved from May 10, 2027 at 9:00 AM to May 12, 2027 at 1:30 PM.',
    )
    expect(rendered.text).toContain('/portal/applications/a1')
    expect(findIsoDates(`${rendered.subject} ${rendered.text} ${rendered.html}`)).toEqual([])
  })
})
