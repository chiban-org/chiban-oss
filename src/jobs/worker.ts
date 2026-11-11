import { PgBoss } from 'pg-boss'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { recordWorkerStart } from '@/features/health/workerState'
import { log } from '@/server/log'
import { setBoss } from './boss'
import { registerAllJobs } from './registerJobs'

const WORKER_START_TIMEOUT_MS = 30_000

export async function startWorker(): Promise<PgBoss> {
  const boss = new PgBoss(env.DATABASE_URL)
  await boss.start()
  setBoss(boss)
  await recordWorkerStart(db, new Date(), AbortSignal.timeout(WORKER_START_TIMEOUT_MS))
  await registerAllJobs(boss, db)
  log.info('worker (pg-boss) started')
  return boss
}
