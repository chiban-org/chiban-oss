import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { users } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { findContractorAccount } from '@/features/contractors/accountLookup'
import { saveContractorProfile } from '@/features/contractors/profile'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

const signal = new AbortController().signal
const EMAIL = 'pat@builder.example'
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

async function contractor(): Promise<string> {
  const id = await makeUser(handle.db, { role: 'applicant', email: EMAIL })
  const actor = (await loadActor(handle.db, id, signal)) as Actor
  await saveContractorProfile(
    handle.db,
    actor,
    {
      name: 'Pat Builder',
      phone: '603-555-0142',
      mailingAddress: null,
      companyName: 'Builder and Sons',
      trades: ['electrical', 'plumbing'],
      licenses: [
        { trade: 'electrical', number: 'EL-20418' },
        { trade: 'plumbing', number: 'PL-3301' },
      ],
    },
    signal,
  )
  return id
}

const find = (email: string, applicationTypeKey = 'EL') =>
  findContractorAccount(handle.db, { email, applicationTypeKey }, signal)

describe('contractor account lookup at the counter', () => {
  it('shows the company and licenses and picks the number for the permit trade', async () => {
    await contractor()
    expect(await find(' PAT@builder.example ')).toEqual({
      companyName: 'Builder and Sons',
      contactName: 'Pat Builder',
      licenses: [
        { trade: 'electrical', label: 'Electrical', number: 'EL-20418' },
        { trade: 'plumbing', label: 'Plumbing', number: 'PL-3301' },
      ],
      prefillLicenseNumber: 'EL-20418',
    })
    expect((await find(EMAIL, 'PL'))?.prefillLicenseNumber).toBe('PL-3301')
  })

  it('prefills nothing when the profile has no number for the permit trade', async () => {
    await contractor()
    expect((await find(EMAIL, 'MG'))?.prefillLicenseNumber).toBeNull()
  })

  it('finds nothing for an applicant without a profile, a disabled account, or a blank email', async () => {
    await makeUser(handle.db, { role: 'applicant', email: 'applicant@alderpond.example' })
    expect(await find('applicant@alderpond.example')).toBeNull()
    const id = await contractor()
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, id))
    expect(await find(EMAIL)).toBeNull()
    expect(await find('  ')).toBeNull()
  })
})
