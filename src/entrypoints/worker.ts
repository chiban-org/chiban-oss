import { env } from '@/config/env'
import { db, pool } from '@/db/client'
import { exitIfUnsafeDemo } from '@/features/demo/demoStartup'
import { startWorker } from '@/jobs/worker'
import { setLogLevel } from '@/server/log'

setLogLevel(env.LOG_LEVEL)
await exitIfUnsafeDemo(db)
const boss = await startWorker()

async function shutdown(): Promise<void> {
  await boss.stop({ graceful: true })
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
