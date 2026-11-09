import { describe, expect, it } from 'vitest'
import { MESSAGES } from '@/features/notifications/messages'
import type { NotificationPayload } from '@/features/notifications/queue'
import { findIsoDates } from '@/test/leaks'

const TOWN = 'Town of Birch Hollow'

describe('notification messages', () => {
  it('write the inspection date in words', () => {
    const rendered = MESSAGES.inspection_scheduled({
      applicationId: 'a1',
      townName: TOWN,
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
    const removed = MESSAGES.permit_corrected({ applicationId: 'a1', townName: TOWN, payload })
    expect(removed.text).toContain('revision 2')
    expect(removed.text).toContain('no longer listed as its contractor')
    expect(removed.text).not.toContain('/portal/applications/a1')
    const party = MESSAGES.permit_corrected({
      applicationId: 'a1',
      townName: TOWN,
      payload: { number: 'EL-2027-0001', revision: 2 },
    })
    expect(party.subject).toBe('Permit EL-2027-0001 corrected')
    expect(party.text).toContain('/portal/applications/a1')
  })

  it('give an applicant without an account a claim link instead of a portal link', () => {
    const claim = { link: 'https://town.example/claim/abc', days: 14 }
    const issued = MESSAGES.application_issued({
      applicationId: 'a1',
      townName: TOWN,
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
      townName: TOWN,
      payload: { number: 'VAR-2027-0001' },
    })
    expect(account.text).toContain('You can download it from your account.')
    expect(account.html).toContain('>Open the application</a>')
  })

  it('ask a board for comments with a link to the board pages and the date in words', () => {
    const rendered = MESSAGES.board_comment_requested({
      applicationId: 'a1',
      townName: TOWN,
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

  it('name the town from the town profile', () => {
    const rendered = MESSAGES.application_submitted({
      applicationId: 'a1',
      townName: TOWN,
      payload: { number: 'BP-2026-0001' },
    })
    expect(rendered.text).toContain('The Town of Birch Hollow received application BP-2026-0001.')
    expect(`${rendered.subject} ${rendered.text} ${rendered.html}`).not.toContain('Alder Pond')
  })

  it('use the wording staff published, with the link still built by code', () => {
    const rendered = MESSAGES.fees_due({
      applicationId: 'a1',
      townName: TOWN,
      payload: { number: 'BP-2026-0001', amountCents: 12500, applicantName: 'Sam <Lee>' },
      wording: {
        fees_due: {
          subject: '{{town.name}}: pay {{fees.amount}}',
          body: 'Dear {{applicant.name}}, please pay {{fees.amount}}.',
        },
      },
    })
    expect(rendered.subject).toBe('Town of Birch Hollow: pay $125.00')
    expect(rendered.text).toContain('Dear Sam <Lee>, please pay $125.00.')
    expect(rendered.html).toContain('Dear Sam &lt;Lee&gt;, please pay $125.00.')
    expect(rendered.text).toContain('/portal/applications/a1')
  })

  it('keep the replaced contractor wording separate from the party wording', () => {
    const wording = {
      permit_corrected_contractor_removed: { subject: 'Removed', body: 'You were removed.' },
    }
    const removed = MESSAGES.permit_corrected({
      applicationId: 'a1',
      townName: TOWN,
      payload: { number: 'EL-2027-0001', revision: 2, contractorRemoved: true },
      wording,
    })
    expect(removed.subject).toBe('Removed')
    const party = MESSAGES.permit_corrected({
      applicationId: 'a1',
      townName: TOWN,
      payload: { number: 'EL-2027-0001', revision: 2 },
      wording,
    })
    expect(party.subject).toBe('Permit EL-2027-0001 corrected')
  })

  it('warn staff of a deadline with a link to the staff record and the date in words', () => {
    const rendered = MESSAGES.clock_due_soon({
      applicationId: 'a1',
      townName: TOWN,
      payload: { number: 'SPR-2026-0004', clockLabel: 'Board action', dueOn: '2026-11-20' },
    })
    expect(rendered.subject).toBe(
      'Deadline coming up: SPR-2026-0004, Board action, due November 20, 2026',
    )
    expect(rendered.text).toContain('/staff/applications/a1')
    expect(findIsoDates(`${rendered.subject} ${rendered.text} ${rendered.html}`)).toEqual([])
    const overdue = MESSAGES.clock_overdue({
      applicationId: 'a1',
      townName: TOWN,
      payload: { number: 'SPR-2026-0004', clockLabel: 'Board action', dueOn: '2026-11-20' },
    })
    expect(overdue.text).toContain(
      'Board action for application SPR-2026-0004: it was due November 20, 2026 and has passed.',
    )
  })

  it('tell parties a decision was filed, with a claim link for those without an account', () => {
    const payload: NotificationPayload = {
      number: 'VAR-2027-0001',
      boardName: 'Zoning Board of Adjustment',
      outcomeLabel: 'Approved',
      filedOn: '2027-01-12',
    }
    const account = MESSAGES.decision_filed({ applicationId: 'a1', townName: TOWN, payload })
    expect(account.subject).toBe('Decision filed: VAR-2027-0001, Approved')
    expect(account.text).toContain('filed with the town on January 12, 2027')
    expect(account.text).toContain('You can read and print it from your account.')
    expect(account.text).toContain('/portal/applications/a1')
    const claimed = MESSAGES.decision_filed({
      applicationId: 'a1',
      townName: TOWN,
      payload,
      claim: { link: 'https://town.example/claim/abc', days: 14 },
    })
    expect(claimed.text).toContain('https://town.example/claim/abc')
    expect(claimed.text).not.toContain('your account')
  })
})
