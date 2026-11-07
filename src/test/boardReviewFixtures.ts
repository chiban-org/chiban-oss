import type { BoardKind } from '@packs/nh/boardSchema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { boards } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { inviteBoardMember } from '@/features/boards/members'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal

export async function addBoard(
  db: Db,
  input: { kind: BoardKind; name: string; shortName: string },
): Promise<string> {
  const [row] = await db.insert(boards).values(input).returning({ id: boards.id })
  if (row === undefined) throw new AppError(ErrorIds.DB_INVARIANT, 'board not inserted')
  return row.id
}

export interface SeatInput {
  email: string
  displayName: string
  boardId: string
  termStart?: string
  termEnd?: string
}

export async function seatMember(db: Db, staff: Actor, input: SeatInput): Promise<Actor> {
  const invited = await inviteBoardMember(
    db,
    createMemoryTransport(),
    staff,
    {
      email: input.email,
      displayName: input.displayName,
      boardId: input.boardId,
      title: 'member',
      termStart: (input.termStart ?? '2020-01-01') as CivilDate,
      ...(input.termEnd === undefined ? {} : { termEnd: input.termEnd as CivilDate }),
    },
    signal,
  )
  if (!invited.ok) throw new AppError(ErrorIds.DB_INVARIANT, `seat failed: ${invited.error}`)
  const actor = await loadActor(db, invited.value.userId, signal)
  if (actor === null) throw new AppError(ErrorIds.DB_INVARIANT, 'seated member has no actor')
  return actor
}
