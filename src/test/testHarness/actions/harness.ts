import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Role } from '@/constants/roles'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import type { MemoryMailTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { clearBoss, setBoss } from '@/jobs/boss'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { staffWith } from '@/test/staffUsers'
import { buildForm, type Fields } from './form'
import { recordingBoss, type SentJob } from './jobs'
import { CSRF_TOKEN, harnessState, resetRequest } from './state'
import { recordWrites } from './writes'

export interface ActionHarness {
  readonly db: Db
  readonly pool: Pool
  readonly mail: MemoryMailTransport
  readonly store: ObjectStore
  readonly jobs: readonly SentJob[]
  signIn(actor: Actor): void
  signOut(): void
  form(fields: Fields, csrfToken?: string | null): FormData
  actorFor(role: Role): Promise<Actor>
  setCookie(name: string, value: string | null): void
  setHeader(name: string, value: string | null): void
  useObjectStore(): void
  recordWrites<T>(run: () => Promise<T>): Promise<{ value: T; written: string[] }>
}

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined)
    throw new AppError(ErrorIds.DB_INVARIANT, `${what} is not ready yet`)
  return value
}

function setOrDelete(map: Map<string, string>, name: string, value: string | null): void {
  if (value === null) map.delete(name)
  else map.set(name, value)
}

export function actionHarness(): ActionHarness {
  let handle: TestDb | null = null
  let wantsStore = false
  const roleActors = new Map<Role, Actor>()

  beforeAll(async () => {
    handle = await makeTestDb()
    harnessState.db = handle.db
    if (wantsStore) harnessState.store = (await makeTestStore()).store
  })
  afterAll(async () => {
    harnessState.db = null
    harnessState.store = null
    clearBoss()
    await handle?.drop()
  })
  beforeEach(() => {
    resetRequest()
    setBoss(recordingBoss(harnessState.jobs))
  })

  const db = () => required(handle, 'The harness database').db
  return {
    get db() {
      return db()
    },
    get pool() {
      return required(handle, 'The harness database').pool
    },
    get mail() {
      return harnessState.mail
    },
    get jobs() {
      return harnessState.jobs
    },
    get store() {
      return required(harnessState.store, 'The object store (call useObjectStore at file scope)')
    },
    signIn: (actor) => {
      harnessState.actor = actor
    },
    signOut: () => {
      harnessState.actor = null
    },
    form: (fields, csrfToken = CSRF_TOKEN) => buildForm(fields, csrfToken),
    actorFor: async (role) => {
      const known = roleActors.get(role)
      if (known !== undefined) return known
      await seedDefaultGrants(db(), new AbortController().signal)
      const actor = await staffWith(db(), [role])
      roleActors.set(role, actor)
      return actor
    },
    setCookie: (name, value) => setOrDelete(harnessState.cookies, name, value),
    setHeader: (name, value) => setOrDelete(harnessState.headers, name, value),
    useObjectStore: () => {
      wantsStore = true
    },
    recordWrites: (run) => recordWrites(required(handle, 'The harness database').pool, run),
  }
}
