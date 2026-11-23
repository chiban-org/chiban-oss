import { describe, expect, it } from 'vitest'
import { recordsError } from '@/server/recordsAction'

describe('records refusal copy', () => {
  it.each([
    ['no_clarification_question', 'This request has no open question to answer.'],
    ['before_acknowledgement', 'The answer cannot be dated before the request was acknowledged.'],
    [
      'redaction_not_cited',
      'A redacted copy needs the exemptions drawn in Chiban before it can be released.',
    ],
  ])('words %s', (code, copy) => {
    expect(recordsError(code)).toBe(copy)
  })
})
