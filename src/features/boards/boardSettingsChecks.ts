import type { PackRule } from '@packs/nh/schema'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'
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

function filingLeadIssue(rule: PackRule, board: Board, error: TownValueError): PublishError {
  if (error === 'adoption_record_missing') {
    return {
      invalid: [
        {
          path: 'filingLeadAdoption',
          message: `Enter who adopted the ${board.label}'s filing deadline and the date they adopted it.`,
        },
      ],
    }
  }
  const policy = rule.overridePolicy
  const message =
    error === 'above_maximum' && policy.policy === 'maximum'
      ? `State law lets the ${board.label} set a filing deadline of at most ${String(policy.ceiling)} days.`
      : `State law does not allow this filing deadline for the ${board.label}.`
  return { invalid: [{ path: 'filingLeadDays', message }] }
}

export function checkBoardSettings(body: BoardSettingsBody): PublishError | null {
  const abutters = abuttersIssue(body.abutters)
  if (abutters !== null) return abutters
  const rule = ruleByKey(loadPack(), FILING_LEAD_KEY)
  for (const board of body.boards) {
    if (board.filingLeadDays === null) continue
    if (board.board !== 'planning_board') {
      return {
        invalid: [{ path: 'boards', message: 'Only the Planning Board has a filing lead time.' }],
      }
    }
    const checked = checkTownValue(rule, {
      value: board.filingLeadDays,
      adoptingAuthority: board.filingLeadAdoption?.adoptingAuthority,
      adoptedOn: board.filingLeadAdoption?.adoptedOn ?? undefined,
    })
    if (!checked.ok) return filingLeadIssue(rule, board, checked.error)
  }
  return null
}
