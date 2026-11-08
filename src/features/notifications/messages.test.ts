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

  it('give an applicant without an account a claim link instead of a portal link', () => {
    const claim = { link: 'https://town.example/claim/abc', days: 14 }
    const issued = MESSAGES.application_issued({
      applicationId: 'a1',
      payload: { number: 'VAR-2027-0001' },
      claim,
    })
    expect(issued.text).toContain('https://town.example/claim/abc')
    expect(issued.text).not.toContain('/portal/applications/a1')
    expect(issued.text).not.toContain('your account')
    expect(issued.text).toContain('It works once and expires in 14 days.')
    expect(issued.html).toContain('>Claim the application</a>')
    const account = MESSAGES.application_issued({
      applicationId: 'a1',
      payload: { number: 'VAR-2027-0001' },
    })
    expect(account.text).toContain('You can download it from your account.')
    expect(account.html).toContain('>Open the application</a>')
  })

  it('ask a board for comments with a link to the board pages and the date in words', () => {
    const rendered = MESSAGES.board_comment_requested({
      applicationId: 'a1',
      payload: {
        number: 'SPR-2026-0004',
        boardName: 'Alder Pond Conservation Commission',
        projectTitle: 'Loon Cove <site> plan',
        commentBy: '2026-11-20',
      },
    })
    expect(rendered.subject).toBe('Comments requested: SPR-2026-0004, Loon Cove <site> plan')
    expect(rendered.text).toContain('asks the Alder Pond Conservation Commission for comments')
    expect(rendered.text).toContain('Comments by November 20, 2026.')
    expect(rendered.text).toMatch(/\/board to read the application/)
    expect(rendered.text).not.toContain('/staff/')
    expect(rendered.html).toContain('Loon Cove &lt;site&gt; plan')
    expect(findIsoDates(`${rendered.subject} ${rendered.text} ${rendered.html}`)).toEqual([])
  })
})
