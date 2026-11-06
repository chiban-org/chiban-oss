import { expect, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { contractorClaims, projectParties } from '@/db/schema'
import { sendContractorClaim } from '@/features/contractors/claims'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeUser } from '@/test/factories'
import { actorOf } from '@/test/staffUsers'
import {
  actionHarness,
  describeActionCases,
  PORTAL_REFUSALS,
  redirectsTo,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { claimProjectAction } = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
const EMAIL = 'pat@alderpond.example'
const INVALID = {
  ok: false as const,
  error: 'This link is no longer valid. Ask the person who sent it for a new one.',
}
let world: PermitWorld | null = null
let contractorId: string | null = null

let issued: string[] = []

async function claimToken(): Promise<string> {
  if (issued.length >= 2) return issued[1] ?? ''
  world ??= await setupPermitWorld(h.db)
  const outbox = createMemoryTransport()
  await sendContractorClaim(
    h.db,
    outbox,
    world.staff,
    { projectId: world.projectId, email: EMAIL, name: 'Pat' },
    signal,
  )
  const token = /\/claim\/([A-Za-z0-9_-]+)/.exec(outbox.sent.at(-1)?.text ?? '')?.[1] ?? ''
  issued = [...issued, token]
  return token
}

async function claimant() {
  contractorId ??= await makeUser(h.db, { role: 'contractor', email: EMAIL })
  return await actorOf(h.db, contractorId)
}

describeActionCases(h, 'claimProjectAction', {
  invoke: claimProjectAction,
  actor: claimant,
  input: async () => ({ token: await claimToken() }),
  fields: { token: text({ required: true }) },
  refusedRoles: ROLES,
  refusals: {
    ...PORTAL_REFUSALS,
    signedOut: { ok: false, error: 'Sign in to claim this project.' },
    forbidden: {
      ok: false,
      error:
        'This link was sent to a different email address than the one you are signed in with. Sign in with the address that received it.',
    },
    invalid: INVALID,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual(redirectsTo('/portal/contractor'))
    expect(
      (await db.select().from(contractorClaims)).filter((c) => c.claimedAt !== null),
    ).toHaveLength(1)
    expect(
      (await db.select().from(projectParties)).filter(
        (p) => p.role === 'contractor' && p.userId === contractorId,
      ),
    ).toHaveLength(1)
  },
})
