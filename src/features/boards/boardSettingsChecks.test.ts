import { describe, expect, it } from 'vitest'
import {
  type BoardSettingsBody,
  BoardSettingsBodySchema,
  boardSettingsDefault,
} from '@/features/boards/boardSettings'
import { checkBoardSettings } from '@/features/boards/boardSettingsChecks'
import type { BoardRow } from '@/features/boards/townBoards'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import type { CivilDate } from '@/types/civilDate'

function board(id: string, kind: BoardRow['kind'], name: string): BoardRow {
  return {
    id,
    kind,
    name,
    shortName: name,
    archivedAt: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

const PLANNING = board(
  '11111111-1111-4111-8111-111111111111',
  'planning_board',
  'Alder Pond Planning Board',
)
const ZBA = board(
  '22222222-2222-4222-8222-222222222222',
  'zba',
  'Alder Pond Zoning Board of Adjustment',
)
const ACTIVE = [PLANNING, ZBA]

const DEFAULT_BODY = boardSettingsDefault(ACTIVE)

type Adoption = BoardSettingsBody['boards'][number]['filingLeadAdoption']

function withFilingLead(days: number, adoption: Adoption): BoardSettingsBody {
  return {
    ...DEFAULT_BODY,
    boards: DEFAULT_BODY.boards.map((b) =>
      b.boardId === PLANNING.id ? { ...b, filingLeadDays: days, filingLeadAdoption: adoption } : b,
    ),
  }
}

function errorsFor(body: BoardSettingsBody) {
  const refused = checkBoardSettings(body, ACTIVE)
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
        ACTIVE,
      ),
    ).toBeNull()
  })

  it('keeps a half-entered adoption record in a draft', () => {
    const draft = withFilingLead(14, { adoptingAuthority: 'Planning Board', adoptedOn: null })
    expect(BoardSettingsBodySchema.safeParse(draft).success).toBe(true)
  })

  it('refuses a filing deadline on a board that does not have one', () => {
    const body = {
      ...DEFAULT_BODY,
      boards: DEFAULT_BODY.boards.map((b) =>
        b.boardId === ZBA.id ? { ...b, filingLeadDays: 14 } : b,
      ),
    }
    expect(errorsFor(body).boards).toBe('Only the Planning Board has a filing lead time.')
  })

  it('refuses an entry for a board that is not active', () => {
    expect(checkBoardSettings(DEFAULT_BODY, [PLANNING])).toEqual({
      invalid: [
        { path: 'boards', message: 'Each entry has to name a board that is still active.' },
      ],
    })
  })

  it('refuses settings that leave an active hearing board without notice settings', () => {
    const body = {
      ...DEFAULT_BODY,
      boards: DEFAULT_BODY.boards.filter((b) => b.boardId !== ZBA.id),
    }
    expect(errorsFor(body).boards).toBe(
      'Add the notice settings for the Alder Pond Zoning Board of Adjustment.',
    )
  })
})
