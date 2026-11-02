import { PgBoss } from 'pg-boss'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { setBoss } from './boss'
import { registerAllJobs } from './registerJobs'

export async function startWorker(): Promise<PgBoss> {
  const boss = new PgBoss(env.DATABASE_URL)
  await boss.start()
  setBoss(boss)
  await registerAllJobs(boss, db)
  console.warn('worker (pg-boss) started')
  return boss
}
