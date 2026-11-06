import type { PgBoss } from 'pg-boss'

export interface SentJob {
  name: string
  data: object
  singletonKey: string | undefined
}

export function recordingBoss(sent: SentJob[]): PgBoss {
  const queues = new Set<string>()
  const boss = {
    send: (name: string, data: object, options?: { singletonKey?: string }) => {
      sent.push({ name, data, singletonKey: options?.singletonKey })
      return Promise.resolve(`job-${sent.length}`)
    },
    getQueue: (name: string) => Promise.resolve(queues.has(name) ? { name } : null),
    createQueue: (name: string) => {
      queues.add(name)
      return Promise.resolve()
    },
  }
  return boss as unknown as PgBoss
}
