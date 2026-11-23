import { ME_STARTERS } from '@packs/me/starters'
import { NH_STARTERS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import type { FormBody } from '@/features/forms/formSchema'
import { validateSubmission } from '@/features/forms/validateSubmission'
import type { StarterBundle } from '@/features/packs/schema'

const SHARED_KEYS = [
  'project_description',
  'applicant_name',
  'applicant_mailing_address',
  'is_owner',
  'owner_authorization',
]

const ANSWERS = {
  project_description: 'Divide one lot into two.',
  applicant_name: 'Rae Fenn',
  applicant_mailing_address: '12 Alder Lane',
}

function sharedForm(starter: StarterBundle): FormBody {
  return {
    ...starter.form,
    fields: starter.form.fields.filter((f) => SHARED_KEYS.includes(f.key)),
  }
}

const BOARD_STARTERS = [
  ...ME_STARTERS.filter((s) => ['VAR', 'AA', 'SUB', 'SPR'].includes(s.applicationType.prefix)),
  ...NH_STARTERS.filter((s) => s.id.startsWith('nh.starter.zba_') || s.id.includes('pb_')),
]

describe('owner authorization on board forms', () => {
  it('there are board starters from both packs to check', () => {
    expect(BOARD_STARTERS.length).toBeGreaterThanOrEqual(8)
  })

  for (const starter of BOARD_STARTERS) {
    const form = sharedForm(starter)
    const check = (extra: Record<string, unknown>) =>
      validateSubmission(form, { ...ANSWERS, ...extra }, { asStaff: false })

    it(`${starter.id}: an owner does not have to tick the authorization`, () => {
      expect(check({ is_owner: 'yes', owner_authorization: false }).ok).toBe(true)
    })

    it(`${starter.id}: someone who is not the owner must tick the authorization`, () => {
      expect(check({ is_owner: 'no', owner_authorization: false }).ok).toBe(false)
      expect(check({ is_owner: 'no', owner_authorization: true }).ok).toBe(true)
    })

    it(`${starter.id}: a blank owner answer still requires the authorization`, () => {
      expect(check({ owner_authorization: false }).ok).toBe(false)
      expect(check({ owner_authorization: true }).ok).toBe(true)
    })
  }
})
