import type { Db } from '@/db/client'
import { townSettings } from '@/db/schema'
import { recordVerification } from '@/features/anonymousIntake/staffControl'

export async function openAnonymousIntake(
  db: Db,
  build: { imageRef: string | null; appVersion: string } = { imageRef: null, appVersion: '0.0.0' },
): Promise<void> {
  await recordVerification(db, {
    imageRef: build.imageRef,
    appVersion: build.appVersion,
    caddyfileSha256: 'f'.repeat(64),
    passed: true,
    findings: [],
  })
  await db.update(townSettings).set({ anonymousIntakeEnabled: true })
}
