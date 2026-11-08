import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contractorProfiles, projectParties } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { saveContractorProfile } from '@/features/contractors/profile'
import { addParty } from '@/features/projects/parties'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'

const signal = new AbortController().signal
const EMAIL = 'pat@builder.example'
const PARALLEL_COPIES = 8
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

const PROFILE = {
  name: 'Pat Builder',
  phone: '603-555-0142',
  mailingAddress: null,
  companyName: 'Builder and Sons',
  trades: [],
  licenses: [],
}

async function account(email = EMAIL): Promise<Actor> {
  const id = await makeUser(handle.db, { role: 'applicant', email })
  return (await loadActor(handle.db, id, signal)) as Actor
}

function addContractor(db: Parameters<typeof addParty>[0], email = EMAIL) {
  return addParty(
    db,
    world.staff,
    { projectId: world.projectId, role: 'contractor', name: 'Pat Builder', email },
    signal,
  )
}

async function partyUsers(email = EMAIL) {
  const rows = await handle.db
    .select({ userId: projectParties.userId })
    .from(projectParties)
    .where(eq(projectParties.email, email))
  return rows.map((r) => r.userId)
}

describe('sign-up racing a party add', () => {
  it('links a party whose add was still open when the profile was saved', async () => {
    const actor = await account()
    const adding = await holdOpen(handle.db, (tx) => addContractor(tx))
    const saving = saveContractorProfile(handle.db, actor, PROFILE, signal)
    const waited = await blockedOrSettled(handle.db, saving)
    await adding.commit()
    expect(waited).toBe('blocked')
    expect(await saving).toEqual({ ok: true, value: { created: true, linkedParties: 1 } })
    expect(await partyUsers()).toEqual([actor.userId])
  })

  it('links a party added while the profile save was still open', async () => {
    const actor = await account()
    const saving = await holdOpen(handle.db, (tx) =>
      saveContractorProfile(tx, actor, PROFILE, signal),
    )
    const adding = addContractor(handle.db)
    const waited = await blockedOrSettled(handle.db, adding)
    await saving.commit()
    expect(waited).toBe('blocked')
    expect((await adding).ok).toBe(true)
    expect(await partyUsers()).toEqual([actor.userId])
  })

  it('links every party when sign-ups and adds for different emails run in parallel', async () => {
    const emails = Array.from({ length: PARALLEL_COPIES }, (_, i) => `pat${i}@builder.example`)
    const actors = await Promise.all(emails.map((email) => account(email)))
    await Promise.all(
      actors.flatMap((actor, i) => [
        saveContractorProfile(handle.db, actor, PROFILE, signal),
        addContractor(handle.db, emails.at(i)),
      ]),
    )
    const rows = await handle.db
      .select({ email: projectParties.email, userId: projectParties.userId })
      .from(projectParties)
      .where(inArray(projectParties.email, emails))
    expect(rows).toHaveLength(PARALLEL_COPIES)
    for (const row of rows) {
      expect(row.userId).toBe(actors[emails.indexOf(row.email ?? '')]?.userId)
    }
  })

  it('keeps one profile when the same account saves twice at once', async () => {
    const actor = await account()
    const results = await Promise.all([
      saveContractorProfile(handle.db, actor, PROFILE, signal),
      saveContractorProfile(handle.db, actor, { ...PROFILE, companyName: 'Second' }, signal),
    ])
    expect(results.map((r) => r.ok && r.value.created).sort()).toEqual([false, true])
    const rows = await handle.db
      .select()
      .from(contractorProfiles)
      .where(eq(contractorProfiles.userId, actor.userId))
    expect(rows).toHaveLength(1)
  })
})
