import { scheduleMeeting } from '@/features/boards/meetings'
import { inviteBoardMember } from '@/features/boards/members'
import { boardIdOf } from '@/features/boards/townBoards'
import { appealsMemberLocal, DEMO_DOMAIN } from '@/features/demo/domain'
import { day, type MaineContext, MEETINGS, meetingDay } from '@/features/demo/me/maineContext'
import { must } from '@/features/demo/seedPermitSupport'
import { createMemoryTransport } from '@/features/mail/memoryTransport'

const PLANNING_SEATS = [
  ['pb.member', 'Robin Vale'],
  ['pb.ashby', 'Nora Ashby'],
  ['pb.coyle', 'Gil Coyle'],
  ['pb.tarrant', 'Wren Tarrant'],
  ['pb.ober', 'Silas Ober'],
] as const
const appealsSeats = () =>
  [
    [appealsMemberLocal(), 'Drew Hale'],
    ['boa.lindqvist', 'Petra Lindqvist'],
    ['boa.marlow', 'Jonah Marlow'],
    ['boa.pruett', 'Ada Pruett'],
    ['boa.keane', 'Hal Keane'],
  ] as const

export function boardVotes(board: 'planning_board' | 'zba') {
  const seats = board === 'planning_board' ? PLANNING_SEATS : appealsSeats()
  return {
    for: seats.length,
    against: 0,
    abstain: 0,
    members: seats.map(([, name]) => ({ name, vote: 'for' as const })),
  }
}

export async function seedMaineBoardSetup(ctx: MaineContext): Promise<void> {
  const boards = [
    ['planning_board', MEETINGS.planning_board, PLANNING_SEATS],
    ['zba', MEETINGS.zba, appealsSeats()],
  ] as const
  for (const [board, schedule, seats] of boards) {
    const boardId = await boardIdOf(ctx.db, board)
    for (const meetingDate of schedule.weeks.map((w) => meetingDay(ctx, schedule, w))) {
      must(
        await scheduleMeeting(
          ctx.db,
          ctx.cast.staff,
          {
            boardId,
            meetingDate,
            kind: 'regular',
            location: 'Fernhollow Town Office, Grange Hall',
          },
          ctx.signal,
        ),
        `meeting ${meetingDate}`,
      )
    }
    for (const [local, displayName] of seats) {
      must(
        await inviteBoardMember(
          ctx.db,
          createMemoryTransport(),
          ctx.cast.admin,
          {
            email: `${local}@${DEMO_DOMAIN}`,
            displayName,
            boardId,
            title: 'member',
            termStart: day(ctx, -300),
          },
          ctx.signal,
        ),
        `member ${local}`,
      )
    }
  }
}
