import { pool } from '@/db/client'
import { startWorker } from '@/jobs/worker'

const boss = await startWorker()

async function shutdown(): Promise<void> {
  await boss.stop({ graceful: true })
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
