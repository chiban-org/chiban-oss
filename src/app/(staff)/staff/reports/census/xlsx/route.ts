import { staffActorOrNull } from '@/server/requireStaff'
import { censusExport, exportSignal } from '../../exportHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const signal = exportSignal()
  const actor = await staffActorOrNull(signal)
  return await censusExport('xlsx')({ request, actor, signal })
}
