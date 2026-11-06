import { test as base, type Page } from '@playwright/test'
import { type E2eDb, openReadOnlyDb } from './db'
import { authStatePath, type RoleKey } from './roles'
import { uniqueSuffix } from './suffix'

export { expect } from '@playwright/test'
export { fillDate } from './dates'
export type { E2eDb } from './db'
export { linkIn, type MailMessage, type MailQuery, waitForEmail } from './mailpit'
export {
  type Account,
  accountFor,
  PUBLIC_ROLE_KEYS,
  type PublicRoleKey,
  type RoleKey,
  type SignedInRoleKey,
  STAFF_ROLE_KEYS,
  type StaffRoleKey,
} from './roles'
export { E2E_BASE_URL, E2E_STAFF_PASSWORD } from './settings'
export { signInWithMagicLink, signInWithPassword } from './signIn'
export { uniqueEmail, uniqueSuffix } from './suffix'

const SIGNED_OUT = { cookies: [], origins: [] }

function storageStateFor(role: RoleKey) {
  return role === 'anonymous' ? SIGNED_OUT : authStatePath(role)
}

interface TestFixtures {
  role: RoleKey
  suffix: string
  pageAs: (role: RoleKey) => Promise<Page>
}

interface WorkerFixtures {
  db: E2eDb
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  role: ['anonymous', { option: true }],
  storageState: async ({ role }, use) => {
    await use(storageStateFor(role))
  },
  suffix: async ({}, use) => {
    await use(uniqueSuffix())
  },
  pageAs: async ({ browser, baseURL }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = []
    await use(async (role) => {
      const context = await browser.newContext({ baseURL, storageState: storageStateFor(role) })
      contexts.push(context)
      return await context.newPage()
    })
    await Promise.all(contexts.map((context) => context.close()))
  },
  db: [
    async ({}, use) => {
      const db = openReadOnlyDb()
      await use(db)
      await db.close()
    },
    { scope: 'worker' },
  ],
})
