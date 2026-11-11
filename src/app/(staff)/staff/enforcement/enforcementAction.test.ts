import { describe, expect, it } from 'vitest'
import { enforcementError } from './enforcementAction'

describe('enforcement refusal copy', () => {
  it.each([
    ['notice_required', /^Send the notice of violation first\./],
    ['complaint_case_in_progress', /already has work recorded/],
    ['public_text_required', /^This case is shown on the public site\./],
    ['case_not_open', /^This case has ended/],
    ['already_on_case', /^That complaint is already on this case\.$/],
  ])('names the problem for %s', (code, copy) => {
    expect(enforcementError(code)).toMatch(copy)
  })
})
