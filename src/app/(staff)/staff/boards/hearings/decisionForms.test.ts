import { describe, expect, it } from 'vitest'
import { parseForm } from '@/server/formInput'
import { RECORD_DECISION_FORM, RECORD_DECISION_NO_HEARING_FORM } from './forms'

const ID = '00000000-0000-4000-8000-000000000001'

function decisionForm(extra: Record<string, string>, venue: 'hearingId' | 'meetingId'): FormData {
  const form = new FormData()
  const fields: Record<string, string> = {
    applicationId: ID,
    [venue]: ID,
    votedOn: '2027-04-28',
    outcome: 'approved',
    motion: 'Move to approve as presented.',
    votes: 'Avery Stone: for',
    findings: 'The proposal meets each criterion of the ordinance.',
    ...extra,
  }
  for (const [name, value] of Object.entries(fields)) form.set(name, value)
  return form
}

describe('the last municipal approval checkbox', () => {
  it('reads a ticked box as a declaration on both decision forms', () => {
    const atHearing = parseForm(
      RECORD_DECISION_FORM,
      decisionForm({ finalMunicipalApproval: 'on' }, 'hearingId'),
    )
    const atMeeting = parseForm(
      RECORD_DECISION_NO_HEARING_FORM,
      decisionForm({ finalMunicipalApproval: 'on' }, 'meetingId'),
    )
    expect(atHearing.ok && atHearing.value.finalMunicipalApproval).toBe(true)
    expect(atMeeting.ok && atMeeting.value.finalMunicipalApproval).toBe(true)
  })

  it('reads an absent box as no declaration', () => {
    const parsed = parseForm(RECORD_DECISION_FORM, decisionForm({}, 'hearingId'))
    expect(parsed.ok && parsed.value.finalMunicipalApproval).toBe(false)
  })
})

describe('the significant land use decision question', () => {
  it('reads yes and no on both decision forms', () => {
    const yes = parseForm(RECORD_DECISION_FORM, decisionForm({ significant: 'yes' }, 'hearingId'))
    const no = parseForm(
      RECORD_DECISION_NO_HEARING_FORM,
      decisionForm({ significant: 'no' }, 'meetingId'),
    )
    expect(yes.ok && yes.value.significant).toBe(true)
    expect(no.ok && no.value.significant).toBe(false)
  })

  it('reads an unanswered or absent question as no answer', () => {
    const blank = parseForm(RECORD_DECISION_FORM, decisionForm({ significant: '' }, 'hearingId'))
    const absent = parseForm(RECORD_DECISION_FORM, decisionForm({}, 'hearingId'))
    expect(blank.ok && blank.value.significant).toBeUndefined()
    expect(absent.ok && absent.value.significant).toBeUndefined()
  })
})
