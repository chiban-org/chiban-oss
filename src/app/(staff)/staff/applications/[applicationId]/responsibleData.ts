import {
  listResponsibleChoices,
  responsibleStaffOf,
} from '@/features/applications/responsibleStaff'
import { hasCapability } from '@/features/authz/capabilities'
import type { StaffContext } from '@/server/requireStaff'
import type { ResponsibleData } from './responsibleStaff'

export async function loadResponsibleData(
  ctx: StaffContext,
  applicationId: string,
): Promise<ResponsibleData> {
  const [current, canManage] = await Promise.all([
    responsibleStaffOf(ctx.db, applicationId),
    hasCapability(ctx.db, ctx.actor.userId, 'application.manage', ctx.signal),
  ])
  return { current, canManage, choices: canManage ? await listResponsibleChoices(ctx.db) : [] }
}
