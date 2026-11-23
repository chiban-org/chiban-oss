import { describe, expect, it } from 'vitest'
import { enforcementError } from './enforcementAction'

describe('enforcement refusal copy', () => {
  it.each([
    ['notice_required', /^Send the notice of violation first\./],
    ['hold_active', /^Release the enforcement hold before resolving or closing the case\.$/],
    ['case_closed', /^This case is closed, so this can no longer be changed\.$/],
    [
      'counsel_notice_required',
      /^Send a notice of violation or a cure notice before referring the case to counsel\.$/,
    ],
    [
      'stay_not_applicable',
      /^An appeal does not stop enforcement here, so there is nothing to record\.$/,
    ],
    ['complaint_case_in_progress', /already has work recorded/],
    ['public_text_required', /^This case is shown on the public site\./],
    ['case_not_open', /^This case has ended/],
    ['already_on_case', /^That complaint is already on this case\.$/],
    [
      'building_code_not_enforced',
      /^This town enforces no building code, so a building code finding or order cannot be added to this case\.$/,
    ],
  ])('names the problem for %s', (code, copy) => {
    expect(enforcementError(code)).toMatch(copy)
  })
})
