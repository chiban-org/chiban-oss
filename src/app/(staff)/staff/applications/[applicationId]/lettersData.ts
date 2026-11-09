import { hasCapability } from '@/features/authz/capabilities'
import { type LetterToMail, lettersToMail } from '@/features/decisions/letterDelivery'
import { townToday } from '@/features/town/today'
import type { StaffContext } from '@/server/requireStaff'

export interface LettersData {
  letters: LetterToMail[]
  canRecord: boolean
  today: string
}

export async function loadLettersData(
  ctx: StaffContext,
  applicationId: string,
): Promise<LettersData> {
  const [letters, canRecord, today] = await Promise.all([
    lettersToMail(ctx.db, applicationId, ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'board.record', ctx.signal),
    townToday(ctx.db, new Date(), ctx.signal),
  ])
  return { letters, canRecord, today }
}
