import { env } from '@/config/env'
import { handleRecoveryForm } from '@/features/export/recovery/recoveryHandler'
import { staffActorOrNull } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function POST(request: Request): Promise<Response> {
  if ((await staffActorOrNull(AbortSignal.timeout(REQUEST_TIMEOUT_MS))) === null) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  return await handleRecoveryForm(request, {
    pgDumpPath: env.PG_DUMP_PATH,
    databaseUrl: env.DATABASE_URL,
    secretKeys: env.CHIBAN_SECRET_KEYS,
    activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
  })
}
