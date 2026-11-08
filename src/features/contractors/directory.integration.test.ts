import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Actor, loadActor } from '@/features/auth/actor'
import { listContractorDirectory } from '@/features/contractors/directory'
import { DIRECTORY_SORT } from '@/features/contractors/directoryParams'
import { saveContractorProfile } from '@/features/contractors/profile'
import { defaultSort } from '@/features/dataTable/sort'
import { addParty } from '@/features/projects/parties'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function contractor(index: number, companyName: string, licenseNumber?: string) {
  const email = `c${index}@builder.example`
  const id = await makeUser(handle.db, { role: 'applicant', email })
  const actor = (await loadActor(handle.db, id, signal)) as Actor
  await saveContractorProfile(
    handle.db,
    actor,
    {
      name: `Contact ${index}`,
      phone: '603-555-0142',
      mailingAddress: null,
      companyName,
      trades: licenseNumber === undefined ? [] : ['plumbing'],
      licenses: licenseNumber === undefined ? [] : [{ trade: 'plumbing', number: licenseNumber }],
    },
    signal,
  )
  return { email, actor }
}

const list = (q = '', offset = 0, viewer: Actor = world.staff) =>
  listContractorDirectory(
    handle.db,
    viewer,
    { q, sort: defaultSort(DIRECTORY_SORT), offset },
    signal,
  )

describe('staff contractor directory', () => {
  it('lists company, contact, trades, licenses and project count', async () => {
    const { email } = await contractor(1, 'Builder and Sons', 'PL-3301')
    await addParty(
      handle.db,
      world.staff,
      { projectId: world.projectId, role: 'contractor', name: 'Contact 1', email },
      signal,
    )
    await makeUser(handle.db, { role: 'applicant', email: 'not.a.contractor@alderpond.example' })
    const page = await list()
    expect(page?.total).toBe(1)
    expect(page?.rows).toEqual([
      expect.objectContaining({
        companyName: 'Builder and Sons',
        contactName: 'Contact 1',
        email,
        phone: '603-555-0142',
        trades: ['plumbing'],
        licenses: [{ trade: 'plumbing', number: 'PL-3301' }],
        projects: 1,
        lastActivity: expect.any(Date),
      }),
    ])
  })

  it('searches company, contact, email and license number', async () => {
    await contractor(1, 'Builder and Sons', 'PL-3301')
    await contractor(2, 'Heron Electric')
    const companies = async (q: string) => (await list(q))?.rows.map((r) => r.companyName)
    expect(await companies('heron')).toEqual(['Heron Electric'])
    expect(await companies('Contact 1')).toEqual(['Builder and Sons'])
    expect(await companies('c2@builder')).toEqual(['Heron Electric'])
    expect(await companies('PL-33')).toEqual(['Builder and Sons'])
    expect(await companies('100%')).toEqual([])
  })

  it('pages at 25 and shows a short last page', async () => {
    for (let i = 0; i < 27; i += 1) {
      await contractor(i, `Company ${String(i).padStart(2, '0')}`)
    }
    const first = await list()
    expect(first?.rows).toHaveLength(25)
    expect(first?.nextOffset).toBe(25)
    const second = await list('', 25)
    expect(second?.rows.map((r) => r.companyName)).toEqual(['Company 25', 'Company 26'])
    expect(second?.nextOffset).toBeNull()
  })

  it('is closed to a viewer without the manage parties capability', async () => {
    await contractor(1, 'Builder and Sons')
    expect(await list('', 0, world.reviewer)).toBeNull()
    expect(await list('', 0, world.applicant)).toBeNull()
  })
})
