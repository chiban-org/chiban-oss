import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applicationNotes, auditLog } from '@/db/schema'
import { addApplicationNote, listApplicationNotes } from '@/features/applications/notes'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function submitted(): Promise<string> {
  return (await makeApplication(handle.db, world, { state: 'submitted' })).applicationId
}

describe('staff notes on an application', () => {
  it('staff add a note and the record lists it with its author, newest first', async () => {
    const applicationId = await submitted()
    const first = await addApplicationNote(
      handle.db,
      world.staff,
      { applicationId, body: 'Called the owner about the missing plot plan.' },
      signal,
    )
    const second = await addApplicationNote(
      handle.db,
      world.staff,
      { applicationId, body: 'Plot plan received at the counter.' },
      signal,
    )
    expect(first.ok && second.ok).toBe(true)
    const notes = await listApplicationNotes(handle.db, world.staff, applicationId, signal)
    expect(notes.map((n) => n.body)).toEqual([
      'Plot plan received at the counter.',
      'Called the owner about the missing plot plan.',
    ])
    expect(notes[0]?.authorName).toBeTruthy()
    const audits = await handle.db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, applicationId), eq(auditLog.action, 'application.note_added')),
      )
    expect(audits).toHaveLength(2)
  })

  it('refuses a note from a user without application.manage and writes nothing', async () => {
    const applicationId = await submitted()
    for (const actor of [
      await staffActor(handle.db, 'inspector'),
      world.reviewer,
      await staffActor(handle.db, 'board_member'),
      world.applicant,
    ]) {
      const result = await addApplicationNote(
        handle.db,
        actor,
        { applicationId, body: 'Should not be saved.' },
        signal,
      )
      expect(result).toEqual({ ok: false, error: 'forbidden' })
    }
    const rows = await handle.db
      .select({ id: applicationNotes.id })
      .from(applicationNotes)
      .where(eq(applicationNotes.applicationId, applicationId))
    expect(rows).toEqual([])
  })

  it('refuses an empty note and a note on an application that does not exist', async () => {
    const applicationId = await submitted()
    const empty = await addApplicationNote(
      handle.db,
      world.staff,
      { applicationId, body: '   ' },
      signal,
    )
    expect(empty).toEqual({ ok: false, error: 'invalid' })
    const missing = await addApplicationNote(
      handle.db,
      world.staff,
      { applicationId: '00000000-0000-4000-8000-000000000000', body: 'Lost note.' },
      signal,
    )
    expect(missing).toEqual({ ok: false, error: 'not_found' })
  })

  it('shows notes to every full-record role and to nobody else', async () => {
    const applicationId = await submitted()
    await addApplicationNote(
      handle.db,
      world.staff,
      { applicationId, body: 'Internal only.' },
      signal,
    )
    const inspector = await staffActor(handle.db, 'inspector')
    expect(await listApplicationNotes(handle.db, inspector, applicationId, signal)).toHaveLength(1)
    for (const actor of [
      world.reviewer,
      await staffActor(handle.db, 'board_member'),
      world.applicant,
    ]) {
      expect(await listApplicationNotes(handle.db, actor, applicationId, signal)).toEqual([])
    }
  })
})
