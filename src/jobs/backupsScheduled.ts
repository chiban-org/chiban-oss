import { env } from '@/config/env'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Db } from '@/db/client'
import { createBackup } from '@/features/backup/createBackup'
import { runScheduledBackup } from '@/features/backup/schedule/runScheduled'
import { buildTarget } from '@/features/export/targets/manageTargets'
import { getObjectStore } from '@/features/storage/objectStore'
import { log } from '@/server/log'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

const HOUR_SECONDS = 60 * 60
const BACKUP_TIMEOUT_SECONDS = 6 * HOUR_SECONDS
const HEARTBEAT_SECONDS = 120
const HOUR_CHARS = 13

async function runWithEnv(db: Db, signal: AbortSignal) {
  return await runScheduledBackup(
    db,
    {
      passphrase: env.BACKUP_PASSPHRASE,
      now: () => new Date(),
      build: (row) => buildTarget(row, { fetch, now: () => new Date() }),
      backup: async (target, passphrase, s) =>
        await createBackup(
          {
            db,
            pgDumpPath: env.PG_DUMP_PATH,
            databaseUrl: env.DATABASE_URL,
            store: getObjectStore(),
            secretKeys: env.CHIBAN_SECRET_KEYS,
            activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
            passphrase,
            target,
            now: new Date(),
          },
          s,
        ),
    },
    signal,
  )
}

export const backupsScheduledJob = defineJob<{ at?: string; manual?: boolean }>({
  name: JOB_NAMES.BACKUPS_SCHEDULED,
  intervalSeconds: HOUR_SECONDS,
  timeoutSeconds: BACKUP_TIMEOUT_SECONDS,
  retryLimit: 0,
  heartbeatSeconds: HEARTBEAT_SECONDS,
  staleAfterSeconds: BACKUP_TIMEOUT_SECONDS + 2 * HOUR_SECONDS,
  dedupKey: (p) => {
    const at = p.at ?? new Date().toISOString()
    return p.manual === true
      ? `${JOB_NAMES.BACKUPS_SCHEDULED}:manual:${at}`
      : `${JOB_NAMES.BACKUPS_SCHEDULED}:${at.slice(0, HOUR_CHARS)}`
  },
  handler: async (_payload, ctx) => {
    const outcome = await runWithEnv(ctx.root, ctx.signal)
    if (outcome === 'failed' || outcome === 'skipped')
      log.warn(`[backup] scheduled backup ${outcome}`)
    return ok(undefined)
  },
})
