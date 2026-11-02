import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contractorClaims, projectParties, userRoles } from '@/db/schema'
import { canViewApplication } from '@/features/access/queries'
import { type Actor, loadActor } from '@/features/auth/actor'
import { claimProject, sendContractorClaim } from '@/features/contractors/claims'
import { listContractorProjects } from '@/features/contractors/dashboard'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { createProject } from '@/features/projects/projects'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { makeParcel, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const EMAIL = 'pat@alderpond.example'
let handle: TestDb
let world: PermitWorld
let mail: MemoryMailTransport

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  mail = createMemoryTransport()
})
afterEach(async () => {
  await handle.drop()
})

async function contractorActor(email = EMAIL): Promise<Actor> {
  const id = await makeUser(handle.db, { role: 'contractor', email })
  const actor = await loadActor(handle.db, id, signal)
  if (actor === null) throw new Error('actor')
  return actor
}

function tokenFromMail(): string {
  const body = mail.sent.at(-1)?.text ?? ''
  const found = /\/claim\/([A-Za-z0-9_-]+)/.exec(body)?.[1]
  if (found === undefined) throw new Error('no token in mail')
  return found
}

async function send(actor: Actor = world.staff, projectId = world.projectId) {
  return await sendContractorClaim(
    handle.db,
    mail,
    actor,
    { projectId, email: EMAIL, name: 'Pat Builder' },
    signal,
  )
}

describe('contractor claims', () => {
  it('sends a claim email with a link and stores only the token hash', async () => {
    const sent = await send()
    expect(sent.ok).toBe(true)
    const message = mail.sent.at(-1)
    expect(message?.to).toBe(EMAIL)
    expect(message?.subject).toBe('Claim your project in Chiban: Garage addition')
    const token = tokenFromMail()
    const [row] = await handle.db.select().from(contractorClaims)
    expect(row?.tokenHash).toBe(createHash('sha256').update(token).digest('base64url'))
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it('contractor sees the project only after claiming', async () => {
    await send()
    const contractor = await contractorActor()
    const app = await makeApplication(handle.db, world)
    expect(await canViewApplication(handle.db, contractor, app.applicationId, signal)).toBe(false)
    const claimed = await claimProject(handle.db, contractor, tokenFromMail(), signal)
    expect(claimed).toEqual({ ok: true, value: { projectId: world.projectId } })
    expect(await canViewApplication(handle.db, contractor, app.applicationId, signal)).toBe(true)
  })

  it('claim by a signed-in user with a different email is refused', async () => {
    await send()
    const other = await contractorActor('someone.else@alderpond.example')
    expect(await claimProject(handle.db, other, tokenFromMail(), signal)).toEqual({
      ok: false,
      error: 'email_mismatch',
    })
    const [party] = await handle.db
      .select()
      .from(projectParties)
      .where(eq(projectParties.email, EMAIL))
    expect(party?.userId).toBeNull()
    const app = await makeApplication(handle.db, world)
    expect(await canViewApplication(handle.db, other, app.applicationId, signal)).toBe(false)
  })

  it('a signed-out visitor is asked to sign in', async () => {
    await send()
    expect(await claimProject(handle.db, null, tokenFromMail(), signal)).toEqual({
      ok: false,
      error: 'sign_in_required',
    })
  })

  it('claim link used twice is invalid', async () => {
    await send()
    const contractor = await contractorActor()
    const token = tokenFromMail()
    expect((await claimProject(handle.db, contractor, token, signal)).ok).toBe(true)
    expect(await claimProject(handle.db, contractor, token, signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('claim after 14 days is invalid with the same message', async () => {
    await send()
    const contractor = await contractorActor()
    const later = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    expect(await claimProject(handle.db, contractor, tokenFromMail(), signal, later)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(await claimProject(handle.db, contractor, 'not-a-token', signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('revoked claim is invalid', async () => {
    await send()
    await handle.db.update(contractorClaims).set({ revokedAt: new Date() })
    const contractor = await contractorActor()
    expect(await claimProject(handle.db, contractor, tokenFromMail(), signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('claim adds the contractor role and keeps applicant', async () => {
    await send()
    const id = await makeUser(handle.db, { role: 'applicant', email: EMAIL })
    const user = (await loadActor(handle.db, id, signal)) as Actor
    expect((await claimProject(handle.db, user, tokenFromMail(), signal)).ok).toBe(true)
    const roles = await handle.db.select().from(userRoles).where(eq(userRoles.userId, id))
    expect(roles.map((r) => r.role).sort()).toEqual(['applicant', 'contractor'])
  })

  it("applicant can send a claim for their own project, not for another's", async () => {
    expect((await send(world.applicant)).ok).toBe(true)
    const stranger = await staffActor(handle.db, 'applicant')
    const project = await createProject(
      handle.db,
      stranger,
      { parcelId: world.parcelId, title: 'Deck' },
      signal,
    )
    if (!project.ok) throw new Error('project')
    expect(await send(world.applicant, project.value.projectId)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('a contractor party cannot send claims', async () => {
    await send()
    const contractor = await contractorActor()
    await claimProject(handle.db, contractor, tokenFromMail(), signal)
    expect(await send(contractor)).toEqual({ ok: false, error: 'forbidden' })
  })

  it('at most 5 claims per project per hour', async () => {
    for (let i = 0; i < 5; i += 1) expect((await send()).ok).toBe(true)
    expect(await send()).toEqual({ ok: false, error: 'rate_limited' })
  })
})

describe('contractor dashboard', () => {
  it('lists projects on two parcels and 2 of 30 with limit 25', async () => {
    await send()
    const contractor = await contractorActor()
    await claimProject(handle.db, contractor, tokenFromMail(), signal)
    const second = await makeParcel(handle.db, [{ format: 'gis12', value: '007002000000' }])
    const project = await createProject(
      handle.db,
      world.applicant,
      { parcelId: second, title: 'Porch' },
      signal,
    )
    if (!project.ok) throw new Error('project')
    await makeApplication(handle.db, world)
    await sendContractorClaim(
      handle.db,
      mail,
      world.staff,
      { projectId: project.value.projectId, email: EMAIL, name: 'Pat Builder' },
      signal,
    )
    await claimProject(handle.db, contractor, tokenFromMail(), signal)
    for (let i = 0; i < 28; i += 1) {
      await createProject(
        handle.db,
        world.applicant,
        { parcelId: second, title: `Other ${i}` },
        signal,
      )
    }
    const page = await listContractorProjects(handle.db, contractor, { limit: 25 }, signal)
    expect(page.rows).toHaveLength(2)
    expect(page.nextCursor).toBeNull()
    expect(new Set(page.rows.map((r) => r.parcelDisplayId)).size).toBe(2)
    const withApp = page.rows.find((r) => r.projectId === world.projectId)
    expect(withApp?.applications).toHaveLength(1)
    expect(withApp?.siteAddress.state).toBeDefined()
  })

  it('shows nothing before a claim', async () => {
    await send()
    const contractor = await contractorActor()
    expect(
      (await listContractorProjects(handle.db, contractor, { limit: 25 }, signal)).rows,
    ).toEqual([])
  })
})
