import { staffActorOrNull } from '@/server/requireStaff'
import { exportSignal, rangeReportExport } from '../../exportHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
): Promise<Response> {
  const signal = exportSignal()
  const actor = await staffActorOrNull(signal)
  return await rangeReportExport('csv')({ request, context, actor, signal })
}
