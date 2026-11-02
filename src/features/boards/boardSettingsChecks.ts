import type { BoardSettingsBody } from '@/features/boards/boardSettings'
import type { PublishError } from '@/features/config/publishChecks'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { checkTownValue } from '@/features/packs/overridePolicy'

const FILING_LEAD_KEY = 'nh.pb.filing_lead'

export function checkBoardSettings(body: BoardSettingsBody): PublishError | null {
  const { abutters } = body
  if (abutters.projectionEnabled) {
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
  }
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
      adoptedOn: board.filingLeadAdoption?.adoptedOn,
    })
    if (!checked.ok)
      return { policyViolations: [{ ruleKey: FILING_LEAD_KEY, error: checked.error }] }
  }
  return null
}
