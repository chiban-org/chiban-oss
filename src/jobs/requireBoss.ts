import type { PgBoss } from 'pg-boss'
import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { getBoss } from './boss'

export function requireBoss(): PgBoss {
  const boss = getBoss()
  if (boss !== null) return boss
  throw new AppError(
    ErrorIds.JOB_BOSS_MISSING,
    'no pg-boss in this process; the job would be silently dropped',
    { nodeEnv: env.NODE_ENV },
  )
}
