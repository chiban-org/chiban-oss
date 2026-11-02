import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { anonymousIntakeVerifications, auditLog, townSettings } from '@/db/schema'
import { intakeOpen } from '@/features/anonymousIntake/enablement'
import {
  disableAnonymousIntake,
  enableAnonymousIntake,
  recordVerification,
} from '@/features/anonymousIntake/staffControl'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const IMAGE_A = 'registry.example/chiban@sha256:aaa'
const IMAGE_B = 'registry.example/chiban@sha256:bbb'
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

const verify = (imageRef: string | null, passed = true, appVersion = '1.0.0') =>
  recordVerification(handle.db, {
    imageRef,
    appVersion,
    caddyfileSha256: 'c'.repeat(64),
    passed,
    findings: passed ? [] : [{ location: 'logs', marker: 'clientIp' }],
  })

const enabled = async () => {
  const [row] = await handle.db.select().from(townSettings)
  return row?.anonymousIntakeEnabled
}

describe('anonymous intake enablement', () => {
  it('enable without a passing verification is verification_required', async () => {
    const admin = await staffActor(handle.db, 'admin')
    expect(
      await enableAnonymousIntake(handle.db, admin, signal, {
        imageRef: IMAGE_A,
        appVersion: '1.0.0',
      }),
    ).toEqual({
      ok: false,
      error: 'verification_required',
    })
    expect(await enabled()).toBe(false)
  })

  it('a failed verification does not enable', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await verify(IMAGE_A, false)
    expect(
      await enableAnonymousIntake(handle.db, admin, signal, {
        imageRef: IMAGE_A,
        appVersion: '1.0.0',
      }),
    ).toEqual({ ok: false, error: 'verification_required' })
  })

  it('verification for an older image ref leaves the route closed', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await verify(IMAGE_A)
    expect(
      (
        await enableAnonymousIntake(handle.db, admin, signal, {
          imageRef: IMAGE_A,
          appVersion: '1.0.0',
        })
      ).ok,
    ).toBe(true)
    expect(await intakeOpen(handle.db, IMAGE_A, '1.0.0', signal)).toBe(true)
    expect(await intakeOpen(handle.db, IMAGE_B, '1.0.0', signal)).toBe(false)
    expect(
      await enableAnonymousIntake(handle.db, admin, signal, {
        imageRef: IMAGE_B,
        appVersion: '1.0.0',
      }),
    ).toEqual({ ok: false, error: 'verification_required' })
  })

  it('without an image ref the app version is compared', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await verify(null, true, '1.0.0')
    expect(
      (
        await enableAnonymousIntake(handle.db, admin, signal, {
          imageRef: null,
          appVersion: '1.0.0',
        })
      ).ok,
    ).toBe(true)
    expect(await intakeOpen(handle.db, null, '1.0.0', signal)).toBe(true)
    expect(await intakeOpen(handle.db, null, '1.0.1', signal)).toBe(false)
  })

  it('switched on but never verified for this image is closed', async () => {
    await handle.db.update(townSettings).set({ anonymousIntakeEnabled: true })
    expect(await intakeOpen(handle.db, IMAGE_A, '1.0.0', signal)).toBe(false)
  })

  it('a verified but switched-off town is closed', async () => {
    await verify(IMAGE_A)
    expect(await intakeOpen(handle.db, IMAGE_A, '1.0.0', signal)).toBe(false)
  })

  it('staff without anonymous_intake.enable are forbidden', async () => {
    const staff = await staffActor(handle.db, 'staff')
    await verify(IMAGE_A)
    expect(
      await enableAnonymousIntake(handle.db, staff, signal, {
        imageRef: IMAGE_A,
        appVersion: '1.0.0',
      }),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(await disableAnonymousIntake(handle.db, staff, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('enabling and disabling are audited', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await verify(IMAGE_A)
    await enableAnonymousIntake(handle.db, admin, signal, {
      imageRef: IMAGE_A,
      appVersion: '1.0.0',
    })
    await disableAnonymousIntake(handle.db, admin, signal)
    const actions = (await handle.db.select().from(auditLog)).map((a) => a.action)
    expect(actions).toEqual(
      expect.arrayContaining(['anonymous_intake.enabled', 'anonymous_intake.disabled']),
    )
    expect(await enabled()).toBe(false)
  })

  it('the newest verification decides', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await verify(IMAGE_A, true)
    await new Promise((r) => setTimeout(r, 5))
    await verify(IMAGE_A, false)
    expect(
      await enableAnonymousIntake(handle.db, admin, signal, {
        imageRef: IMAGE_A,
        appVersion: '1.0.0',
      }),
    ).toEqual({ ok: false, error: 'verification_required' })
    expect(
      (
        await handle.db
          .select()
          .from(anonymousIntakeVerifications)
          .where(eq(anonymousIntakeVerifications.passed, false))
      ).length,
    ).toBe(1)
  })
})
