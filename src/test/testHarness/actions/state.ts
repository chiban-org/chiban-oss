import { CSRF_COOKIE } from '@/constants/cookies'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { SentJob } from './jobs'

export const CSRF_TOKEN = 'tok'

const SAME_ORIGIN_HEADERS: Readonly<Record<string, string>> = {
  origin: 'https://alderpond.example',
  host: 'alderpond.example',
  'sec-fetch-site': 'same-origin',
}

export interface HarnessState {
  db: Db | null
  actor: Actor | null
  cookies: Map<string, string>
  headers: Map<string, string>
  mail: MemoryMailTransport
  store: ObjectStore | null
  jobs: SentJob[]
}

export const harnessState: HarnessState = {
  db: null,
  actor: null,
  cookies: new Map(),
  headers: new Map(),
  mail: createMemoryTransport(),
  store: null,
  jobs: [],
}

export function resetRequest(): void {
  harnessState.actor = null
  harnessState.cookies = new Map([[CSRF_COOKIE, CSRF_TOKEN]])
  harnessState.headers = new Map(Object.entries(SAME_ORIGIN_HEADERS))
  harnessState.mail = createMemoryTransport()
  harnessState.jobs = []
}
