import type { JobName } from '@/constants/jobNames'
import { requireBoss } from './requireBoss'

export async function ensureQueue(name: JobName): Promise<void> {
  const boss = requireBoss()
  const existing = await boss.getQueue(name)
  if (existing === null) await boss.createQueue(name, { policy: 'exclusive' })
}
