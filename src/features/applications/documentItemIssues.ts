import type { DocumentItem } from '@/features/applications/documentItemSchema'
import { boardAbbrev, boardShort } from '@/features/packs/vocabulary'

export function statePermitAtFiling(): string {
  return `A ${boardShort('planning_board')} or ${boardAbbrev('zba')} application cannot require a state or federal permit to file. Move this document to before the decision.`
}

export const DUPLICATE_DOCUMENT_KEY = 'duplicate document key'

const BOARDS_THAT_CANNOT_REQUIRE_PERMITS_TO_FILE: ReadonlySet<string> = new Set([
  'planning_board',
  'zba',
])

export function documentItemIssues(
  items: readonly DocumentItem[],
  boardKind: string | null,
): { index: number; field: 'key' | 'stage'; message: string }[] {
  const out: { index: number; field: 'key' | 'stage'; message: string }[] = []
  const seen = new Set<string>()
  items.forEach((item, index) => {
    if (seen.has(item.key)) out.push({ index, field: 'key', message: DUPLICATE_DOCUMENT_KEY })
    seen.add(item.key)
    const boardFiling =
      boardKind !== null && BOARDS_THAT_CANNOT_REQUIRE_PERMITS_TO_FILE.has(boardKind)
    if (boardFiling && item.stage === 'to_file' && item.stateOrFederalPermit === true) {
      out.push({ index, field: 'stage', message: statePermitAtFiling() })
    }
  })
  return out
}
