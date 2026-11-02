import { APP_VERSION } from '@/config/appVersion'
import type { DbOrTx } from '@/db/client'
import { getMigrationHead } from '@/db/migrationHead'
import { packInfo } from '@/features/packs/packInfo'

export async function versionResponse(db: DbOrTx, signal: AbortSignal): Promise<Response> {
  try {
    const migrationHead = await getMigrationHead(db, signal)
    return Response.json({ appVersion: APP_VERSION, pack: packInfo(), migrationHead })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }
}
