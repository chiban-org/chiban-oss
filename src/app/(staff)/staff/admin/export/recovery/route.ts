import { env } from '@/config/env'
import { handleRecoveryRequest } from '@/features/export/recovery/recoveryHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return await handleRecoveryRequest(request, {
    pgDumpPath: env.PG_DUMP_PATH,
    databaseUrl: env.DATABASE_URL,
    secretKeys: env.CHIBAN_SECRET_KEYS,
    activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
  })
}
