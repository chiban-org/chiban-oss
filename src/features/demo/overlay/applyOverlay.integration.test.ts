import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activeBoards } from '@/features/boards/townBoards'
import { pinCurrent } from '@/features/config/bindings'
import { getPublished, getVersion } from '@/features/config/store'
import { applyOverlaySettings } from '@/features/demo/overlay/applySettings'
import { applyOverlayStarters } from '@/features/demo/overlay/applyStarters'
import { parseDemoOverlay } from '@/features/demo/overlay/checkOverlay'
import type { DemoOverlay } from '@/features/demo/overlay/overlaySchema'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormBody } from '@/features/forms/formSchema'
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

function overlayOf(json: unknown): DemoOverlay {
  const parsed = parseDemoOverlay({ version: 1, ...(json as object) })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error))
  return parsed.value
}

async function run(json: unknown) {
  const actor = await staffActor(handle.db, 'admin')
  return { db: handle.db, actor, overlay: overlayOf(json), signal }
}

async function feeLines(key: string) {
  const row = await getPublished(handle.db, 'fee_schedule', key, signal)
  return (row?.body as FeeScheduleBody).lines
}

describe('applyOverlayStarters', () => {
  it('adopts the listed starters, publishes their fees and skips one this build lacks', async () => {
    const overlayRun = await run({
      starters: ['VAR', 'SG', 'QQ'],
      boards: { zba: { noticeFees: { perAbutterCents: 900, advertisingCents: 8000 } } },
      applicationTypes: {
        SG: {
          formFields: [
            {
              key: 'sign_duration',
              label: 'Temporary or permanent sign',
              type: 'select',
              required: true,
              options: [
                { value: 'temporary', label: 'Temporary' },
                { value: 'permanent', label: 'Permanent' },
              ],
            },
          ],
          fees: {
            sg: {
              expr: {
                op: 'conditional_multiplier',
                when: { field: 'sign_duration', op: 'equals', value: 'temporary' },
                factor: 0.5,
                of: { op: 'flat', cents: 3000 },
              },
            },
          },
        },
      },
    })
    const report = await applyOverlayStarters(overlayRun)
    expect(report).toEqual({ notInstalled: ['QQ'], changedTypes: ['VAR', 'SG'] })
    expect(await applyOverlayStarters(overlayRun)).toEqual({
      notInstalled: ['QQ'],
      changedTypes: [],
    })
    const variance = await feeLines('var-fees')
    expect(variance.find((l) => l.code === 'notice_mail')?.expr).toMatchObject({
      centsPerUnit: 900,
    })
    expect(variance.find((l) => l.code === 'notice_newspaper')?.expr).toEqual({
      op: 'flat',
      cents: 8000,
    })
    const form = await getPublished(handle.db, 'form', 'sg-form', signal)
    expect((form?.body as FormBody).fields.map((f) => f.key)).toContain('sign_duration')
    const pins = await pinCurrent(handle.db, 'SG', signal)
    if (!pins.ok) throw new Error(pins.error)
    const pinned = await getVersion(handle.db, pins.value.feeSchedule, signal)
    expect((pinned?.body as FeeScheduleBody).lines[0]?.expr).toMatchObject({ factor: 0.5 })
  })
})

describe('applyOverlaySettings', () => {
  it('fails with the overlay path when there is nothing published to merge onto', async () => {
    await expect(
      applyOverlaySettings(await run({ townProfile: { phone: '603-555-0199' } })),
    ).rejects.toThrow('demo overlay: townProfile: no published town_profile default')
  })

  it('fails with the overlay path when the town has no board of that kind', async () => {
    await expect(
      applyOverlaySettings(
        await run({ boards: { housing_commission: { notice: { newspaper: 'Courier' } } } }),
      ),
    ).rejects.toThrow('demo overlay: boards.housing_commission.notice: there is no active')
  })

  it('publishes board notice places over the defaults for the named board only', async () => {
    await applyOverlaySettings(
      await run({
        boards: {
          zba: { notice: { newspaper: 'Alder Pond Courier', bulletinBoards: ['Town Hall lobby'] } },
        },
      }),
    )
    const row = await getPublished(handle.db, 'board_settings', 'default', signal)
    const notices = (row?.body as { boards: { publicNotice: { newspaper: string | null } }[] })
      .boards
    expect(notices.map((b) => b.publicNotice.newspaper).sort()).toEqual([
      'Alder Pond Courier',
      null,
    ])
  })

  it('renames a board through the board admin, keeping the short name unless given', async () => {
    await applyOverlaySettings(
      await run({ boards: { zba: { name: 'Alder Pond Village Zoning Board of Adjustment' } } }),
    )
    const rows = await activeBoards(handle.db)
    const zba = rows.find((b) => b.kind === 'zba')
    expect(zba).toMatchObject({
      name: 'Alder Pond Village Zoning Board of Adjustment',
      shortName: 'Zoning Board of Adjustment',
    })
  })

  it('fails with the overlay path when the new name is already taken', async () => {
    const rows = await activeBoards(handle.db)
    const planning = rows.find((b) => b.kind === 'planning_board')
    await expect(
      applyOverlaySettings(await run({ boards: { zba: { name: planning?.name ?? '' } } })),
    ).rejects.toThrow('demo overlay: boards.zba.name: the configuration refused it: "name_taken"')
  })
})
