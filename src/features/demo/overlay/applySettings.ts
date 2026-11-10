import type { BoardKind } from '@packs/nh/boardSchema'
import {
  type BoardSettingsBody,
  boardSettingsDefault,
  reconcileBoardSettings,
} from '@/features/boards/boardSettingsSchema'
import { activeBoards } from '@/features/boards/townBoards'
import { getPublished } from '@/features/config/store'
import { applyBoardNames } from '@/features/demo/overlay/applyBoardNames'
import { failWith } from '@/features/demo/overlay/overlayIssue'
import type { OverlayProfile } from '@/features/demo/overlay/overlaySchema'
import {
  type OverlayRun,
  publishedBody,
  publishOverlayBody,
} from '@/features/demo/overlay/publishOverlay'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'
import type { TownProfileBody } from '@/features/town/profileSchema'

type BoardIds = Map<string, string[]>

async function boardIdsByKind(run: OverlayRun): Promise<BoardIds> {
  const ids: BoardIds = new Map()
  for (const board of await activeBoards(run.db)) {
    ids.set(board.kind, [...(ids.get(board.kind) ?? []), board.id])
  }
  return ids
}

function idsFor(ids: BoardIds, kind: string, path: string): string[] {
  const found = ids.get(kind) ?? []
  if (found.length === 0) failWith([{ path, message: `there is no active ${kind} board` }])
  return found
}

export function mergeProfile(
  body: TownProfileBody,
  overlay: OverlayProfile,
  ids: BoardIds,
): TownProfileBody {
  const { boards, letterheadFooter, ...fields } = overlay
  const overrides = new Map(Object.entries(body.boardOverrides))
  for (const [kind, override] of Object.entries(boards ?? {})) {
    for (const id of idsFor(ids, kind, `townProfile.boards.${kind}`)) {
      overrides.set(id, { ...overrides.get(id), ...override })
    }
  }
  const boardOverrides = Object.fromEntries(overrides)
  const letterhead =
    letterheadFooter === undefined
      ? body.letterhead
      : { ...body.letterhead, footerText: letterheadFooter }
  return { ...body, ...fields, letterhead, boardOverrides }
}

async function applyProfile(run: OverlayRun, ids: BoardIds): Promise<void> {
  const overlay = run.overlay.townProfile
  if (overlay === undefined) return
  const target = { kind: 'town_profile' as const, key: 'default', path: 'townProfile' }
  const body = await publishedBody<TownProfileBody>(run, target)
  await publishOverlayBody(run, { ...target, body: mergeProfile(body, overlay, ids) })
}

async function applyPayments(run: OverlayRun): Promise<void> {
  const overlay = run.overlay.paymentSettings
  if (overlay === undefined) return
  const target = { kind: 'payment_settings' as const, key: 'default', path: 'paymentSettings' }
  const body = await publishedBody<PaymentSettingsBody>(run, target)
  await publishOverlayBody(run, { ...target, body: { ...body, ...overlay } })
}

async function currentBoardSettings(run: OverlayRun): Promise<BoardSettingsBody> {
  const active = await activeBoards(run.db)
  const row = await getPublished(run.db, 'board_settings', 'default', run.signal)
  if (row === null) return boardSettingsDefault(active)
  return reconcileBoardSettings(row.body as BoardSettingsBody, active)
}

async function applyBoardNotices(run: OverlayRun, ids: BoardIds): Promise<void> {
  const notices = Object.entries(run.overlay.boards ?? {}).flatMap(([kind, board]) =>
    board.notice === undefined ? [] : [{ kind: kind as BoardKind, notice: board.notice }],
  )
  if (notices.length === 0) return
  const body = await currentBoardSettings(run)
  const byId = new Map<string, (typeof notices)[number]['notice']>()
  for (const { kind, notice } of notices) {
    for (const id of idsFor(ids, kind, `boards.${kind}.notice`)) byId.set(id, notice)
  }
  const boards = body.boards.map((entry) => {
    const notice = byId.get(entry.boardId)
    return notice === undefined
      ? entry
      : { ...entry, publicNotice: { ...entry.publicNotice, ...notice } }
  })
  await publishOverlayBody(run, {
    kind: 'board_settings',
    key: 'default',
    body: { ...body, boards },
    path: 'boards',
  })
}

export async function applyOverlaySettings(run: OverlayRun): Promise<void> {
  run.signal.throwIfAborted()
  await applyBoardNames(run)
  const ids = await boardIdsByKind(run)
  await applyProfile(run, ids)
  await applyPayments(run)
  await applyBoardNotices(run, ids)
}
