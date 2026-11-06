import { mkdir } from 'node:fs/promises'
import { type Browser, chromium, type FullConfig } from '@playwright/test'
import {
  accountFor,
  authStatePath,
  PUBLIC_ROLE_KEYS,
  type SignedInRoleKey,
  STAFF_ROLE_KEYS,
} from '../fixtures/roles'
import { E2E_AUTH_DIR, E2E_BASE_URL } from '../fixtures/settings'
import { signInWithMagicLink, signInWithPassword } from '../fixtures/signIn'

async function saveSignedInState(browser: Browser, role: SignedInRoleKey): Promise<void> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL })
  const page = await context.newPage()
  const account = accountFor(role)
  try {
    if (account.signIn === 'password') await signInWithPassword(page, account.email)
    else await signInWithMagicLink(page, account.email)
    await context.storageState({ path: authStatePath(role) })
  } finally {
    await context.close()
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await mkdir(E2E_AUTH_DIR, { recursive: true })
  const browser = await chromium.launch()
  try {
    await Promise.all(
      [...STAFF_ROLE_KEYS, ...PUBLIC_ROLE_KEYS].map((role) => saveSignedInState(browser, role)),
    )
  } finally {
    await browser.close()
  }
}
