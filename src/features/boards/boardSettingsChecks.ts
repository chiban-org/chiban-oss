import { BOARD_KIND_TRAITS, type PackRule } from '@packs/nh/schema'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'
import type { BoardRow } from '@/features/boards/townBoards'
import type { PublishError } from '@/features/config/publishChecks'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { checkTownValue, type TownValueError } from '@/features/packs/overridePolicy'

const FILING_LEAD_KEY = 'nh.pb.filing_lead'

type Board = BoardSettingsBody['boards'][number]

function abuttersIssue(abutters: BoardSettingsBody['abutters']): PublishError | null {
  if (!abutters.projectionEnabled) return null
  if (abutters.layersConfirmedBy === null) {
    return {
      invalid: [
        {
          path: 'abutters.layersConfirmedBy',
          message: 'Name who confirmed the road and water layers before turning projection on.',
        },
      ],
    }
  }
  if (abutters.layersConfirmedOn === null) {
    return {
      invalid: [
        {
          path: 'abutters.layersConfirmedOn',
          message: 'Enter the date the road and water layers were confirmed.',
        },
      ],
    }
  }
  return null
}

function filingLeadIssue(
  rule: PackRule,
  board: Pick<BoardRow, 'name'>,
  error: TownValueError,
): PublishError {
  if (error === 'adoption_record_missing') {
    return {
      invalid: [
        {
          path: 'filingLeadAdoption',
          message: `Enter who adopted the ${board.name}'s filing deadline and the date they adopted it.`,
        },
      ],
    }
  }
  const policy = rule.overridePolicy
  const message =
    error === 'above_maximum' && policy.policy === 'maximum'
      ? `State law lets the ${board.name} set a filing deadline of at most ${String(policy.ceiling)} days.`
      : `State law does not allow this filing deadline for the ${board.name}.`
  return { invalid: [{ path: 'filingLeadDays', message }] }
}

function entryIssue(entries: Board[], active: BoardRow[]): PublishError | null {
  const activeIds = new Set(active.map((b) => b.id))
  if (entries.some((e) => !activeIds.has(e.boardId))) {
    return {
      invalid: [
        { path: 'boards', message: 'Each entry has to name a board that is still active.' },
      ],
    }
  }
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.boardId)) {
      return { invalid: [{ path: 'boards', message: 'Each board can appear only once.' }] }
    }
    seen.add(entry.boardId)
  }
  const missing = active.find((b) => BOARD_KIND_TRAITS[b.kind].holdsHearings && !seen.has(b.id))
  if (missing !== undefined) {
    return {
      invalid: [{ path: 'boards', message: `Add the notice settings for the ${missing.name}.` }],
    }
  }
  return null
}

export function checkBoardSettings(
  body: BoardSettingsBody,
  active: BoardRow[],
): PublishError | null {
  const abutters = abuttersIssue(body.abutters)
  if (abutters !== null) return abutters
  const entries = entryIssue(body.boards, active)
  if (entries !== null) return entries
  const rule = ruleByKey(loadPack(), FILING_LEAD_KEY)
  for (const entry of body.boards) {
    if (entry.filingLeadDays === null) continue
    const board = active.find((b) => b.id === entry.boardId)
    if (board === undefined || !BOARD_KIND_TRAITS[board.kind].hasFilingLead) {
      return {
        invalid: [{ path: 'boards', message: 'Only the Planning Board has a filing lead time.' }],
      }
    }
    const checked = checkTownValue(rule, {
      value: entry.filingLeadDays,
      adoptingAuthority: entry.filingLeadAdoption?.adoptingAuthority,
      adoptedOn: entry.filingLeadAdoption?.adoptedOn ?? undefined,
    })
    if (!checked.ok) return filingLeadIssue(rule, board, checked.error)
  }
  return null
}
