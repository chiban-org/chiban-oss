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
})
