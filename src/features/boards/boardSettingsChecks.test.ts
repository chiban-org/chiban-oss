import { describe, expect, it } from 'vitest'
import {
  BOARD_SETTINGS_DEFAULT,
  type BoardSettingsBody,
  BoardSettingsBodySchema,
} from '@/features/boards/boardSettings'
import { checkBoardSettings } from '@/features/boards/boardSettingsChecks'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import type { CivilDate } from '@/types/civilDate'

type Adoption = BoardSettingsBody['boards'][number]['filingLeadAdoption']

function withFilingLead(days: number, adoption: Adoption): BoardSettingsBody {
  return {
    ...BOARD_SETTINGS_DEFAULT,
    boards: BOARD_SETTINGS_DEFAULT.boards.map((b) =>
      b.board === 'planning_board'
        ? { ...b, filingLeadDays: days, filingLeadAdoption: adoption }
        : b,
    ),
  }
}

function errorsFor(body: BoardSettingsBody) {
  const refused = checkBoardSettings(body)
  return refused === null ? {} : fieldErrorsFor(refused)
}

const ADOPTED_ON = '2027-01-12' as CivilDate

describe('board settings filing deadline', () => {
  it('names the board and the field when the deadline is over the state limit', () => {
    const errors = errorsFor(
      withFilingLead(30, { adoptingAuthority: 'Planning Board', adoptedOn: ADOPTED_ON }),
    )
    expect(errors.filingLeadDays).toBe(
      'State law lets the Alder Pond Planning Board set a filing deadline of at most 21 days.',
    )
  })

  it('asks for the adoption record beside the filing deadline when it is missing', () => {
    const errors = errorsFor(withFilingLead(14, { adoptingAuthority: '', adoptedOn: null }))
    expect(errors.filingLeadAdoption).toBe(
      "Enter who adopted the Alder Pond Planning Board's filing deadline and the date they adopted it.",
    )
    expect(
      errorsFor(withFilingLead(14, { adoptingAuthority: 'Planning Board', adoptedOn: null }))
        .filingLeadAdoption,
    ).toBeDefined()
  })

  it('publishes a shorter deadline once who adopted it and when are on file', () => {
    expect(
      checkBoardSettings(
        withFilingLead(14, { adoptingAuthority: 'Planning Board', adoptedOn: ADOPTED_ON }),
      ),
    ).toBeNull()
  })

  it('keeps a half-entered adoption record in a draft', () => {
    const draft = withFilingLead(14, { adoptingAuthority: 'Planning Board', adoptedOn: null })
    expect(BoardSettingsBodySchema.safeParse(draft).success).toBe(true)
  })
})
