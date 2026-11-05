import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adoptStarter } from '@/features/config/adoptStarter'
import { getEditorState, labelOfBody, listKeysOfKind } from '@/features/config/settingsViews'
import { saveDraft } from '@/features/config/store'
import { FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('settings views', () => {
  it('lists keys of a kind with published version and draft flag', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'form', 'a-form', FORM_BODY)
    await saveDraft(
      handle.db,
      admin,
      { kind: 'form', key: 'a-form', body: { ...FORM_BODY, label: 'Edited' } },
      signal,
    )
    await saveDraft(handle.db, admin, { kind: 'form', key: 'b-form', body: FORM_BODY }, signal)
    const keys = await listKeysOfKind(handle.db, 'form', signal)
    expect(keys).toEqual([
      { key: 'a-form', label: 'Building permit form', publishedVersion: 1, hasDraft: true },
      { key: 'b-form', label: 'Building permit form', publishedVersion: null, hasDraft: true },
    ])
  })

  it('names a town rule setting by the pack rule it sets and leaves an unnamed key blank', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await adoptStarter(handle.db, admin, 'nh.starter.electrical', signal)
    const [type] = await listKeysOfKind(handle.db, 'application_type', signal)
    expect(type?.label).toBe('Electrical permit')
    await saveDraft(
      handle.db,
      admin,
      {
        kind: 'town_rule_setting',
        key: 'town.bp.expiration',
        body: { ruleKey: 'town.bp.expiration', value: 2 },
      },
      signal,
    )
    const [rule] = await listKeysOfKind(handle.db, 'town_rule_setting', signal)
    expect(rule?.label).not.toBeNull()
    expect(rule?.label).not.toBe('town.bp.expiration')
    expect(labelOfBody('town_rule_setting', { ruleKey: 'no.such.rule', value: 1 })).toBeNull()
    expect(labelOfBody('fee_schedule', { lines: [] })).toBeNull()
  })

  it('editor state prefers the draft, then the published body, then a skeleton', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'form', 'a-form', FORM_BODY)
    const published = await getEditorState(handle.db, 'form', 'a-form', signal)
    expect((published.body as { label: string }).label).toBe('Building permit form')
    expect(published.versions).toMatchObject([
      {
        version: 1,
        status: 'published',
        publishedBy: admin.userId.length > 0 ? expect.any(String) : '',
      },
    ])
    await saveDraft(
      handle.db,
      admin,
      { kind: 'form', key: 'a-form', body: { ...FORM_BODY, label: 'Edited' } },
      signal,
    )
    const drafted = await getEditorState(handle.db, 'form', 'a-form', signal)
    expect((drafted.body as { label: string }).label).toBe('Edited')
    const fresh = await getEditorState(handle.db, 'form', 'brand-new', signal)
    expect(fresh.versions).toEqual([])
    expect(fresh.body).toMatchObject({ key: 'brand-new' })
  })

  it('lists what changed against the previous version, labelled for amendments', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const base = {
      title: 'Snow load',
      codeSection: 'R301.2',
      adoptingAuthority: 'Town Meeting',
      adoptedOn: '2026-03-10',
      reviewBoardConfirmedOn: null,
    }
    await saveAndPublish(handle.db, admin, 'local_code_amendment', 'snow', {
      ...base,
      townText: 'Fifty pounds.',
    })
    await saveAndPublish(handle.db, admin, 'local_code_amendment', 'snow', {
      ...base,
      townText: 'Sixty pounds.',
    })
    const state = await getEditorState(handle.db, 'local_code_amendment', 'snow', signal)
    const [latest, first] = state.versions
    expect(first?.changes).toBeUndefined()
    expect(latest?.changes).toEqual({
      from: 1,
      items: [
        {
          path: '/townText',
          label: "Town's amended text",
          before: 'Fifty pounds.',
          after: 'Sixty pounds.',
          inline: false,
        },
      ],
    })
  })
})
