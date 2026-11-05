import { describe, expect, it } from 'vitest'
import { MESSAGES } from '@/features/notifications/messages'
import type { NotificationPayload } from '@/features/notifications/queue'
import { findIsoDates } from '@/test/leaks'

describe('notification messages', () => {
  it('write the inspection date in words', () => {
    const rendered = MESSAGES.inspection_scheduled({
      applicationId: 'a1',
      payload: {
        number: 'BP-2026-0001',
        inspectionLabel: 'Framing',
        onDate: '2026-11-02',
        atTime: '9:00 AM',
      },
    })
    expect(rendered.subject).toContain('November 2, 2026')
    expect(rendered.text).toContain('November 2, 2026')
    expect(findIsoDates(`${rendered.subject} ${rendered.text} ${rendered.html}`)).toEqual([])
  })

  it('tell a replaced contractor about a correction without linking the application', () => {
    const payload: NotificationPayload = {
      number: 'EL-2027-0001',
      revision: 2,
      contractorRemoved: true,
    }
    const removed = MESSAGES.permit_corrected({ applicationId: 'a1', payload })
    expect(removed.text).toContain('revision 2')
    expect(removed.text).toContain('no longer listed as its contractor')
    expect(removed.text).not.toContain('/portal/applications/a1')
    const party = MESSAGES.permit_corrected({
      applicationId: 'a1',
      payload: { number: 'EL-2027-0001', revision: 2 },
    })
    expect(party.subject).toBe('Permit EL-2027-0001 corrected')
    expect(party.text).toContain('/portal/applications/a1')
  })
})
