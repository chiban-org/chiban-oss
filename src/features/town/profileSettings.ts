import type { Db, DbOrTx } from '@/db/client'
import { transactionResult } from '@/db/transactionResult'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { configIssueCopy } from '@/features/config/issueCopy'
import { type PublishError, publishNewVersion } from '@/features/config/publish'
import { getPublished, lockConfigKey } from '@/features/config/store'
import {
  TOWN_PROFILE_SKELETON,
  type TownProfileBody,
  TownProfileBodySchema,
} from '@/features/town/profileSchema'
import { err, ok, type Result } from '@/types/result'

export const TOWN_PROFILE_SECTIONS = ['profile', 'letterhead', 'signers'] as const
export type TownProfileSection = (typeof TOWN_PROFILE_SECTIONS)[number]

export function isTownProfileSection(value: string): value is TownProfileSection {
  return (TOWN_PROFILE_SECTIONS as readonly string[]).includes(value)
}

function fieldsOf(section: TownProfileSection): readonly (keyof TownProfileBody)[] {
  switch (section) {
    case 'profile':
      return ['officeName', 'addressLines', 'phone', 'email', 'website', 'officeHours', 'logo']
    case 'letterhead':
      return ['letterhead', 'boardOverrides']
    case 'signers':
      return ['signers']
  }
}

const KIND = 'town_profile'
const KEY = 'default'

export async function townProfileForEditing(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<{ body: TownProfileBody; version: number | null }> {
  const row = await getPublished(db, KIND, KEY, signal)
  const parsed = TownProfileBodySchema.safeParse(row?.body)
  return parsed.success && row !== null
    ? { body: parsed.data, version: row.version }
    : { body: TOWN_PROFILE_SKELETON, version: null }
}

function pickSection(section: TownProfileSection, slice: unknown): Record<string, unknown> {
  const source = new Map(Object.entries(typeof slice === 'object' && slice !== null ? slice : {}))
  return Object.fromEntries(
    fieldsOf(section).flatMap((field) => (source.has(field) ? [[field, source.get(field)]] : [])),
  )
}

export async function publishTownProfileSection(
  db: Db,
  actor: Actor,
  input: { section: TownProfileSection; slice: unknown },
  signal: AbortSignal,
): Promise<Result<{ version: number }, PublishError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult<{ version: number }, PublishError>(db, async (tx) => {
    await lockConfigKey(tx, KIND, KEY)
    const current = await townProfileForEditing(tx, signal)
    const merged = TownProfileBodySchema.safeParse({
      ...current.body,
      ...pickSection(input.section, input.slice),
    })
    if (!merged.success) {
      return err({
        invalid: merged.error.issues.map((i) => configIssueCopy('town_profile', i)),
      })
    }
    const published = await publishNewVersion(
      tx,
      actor,
      { kind: KIND, key: KEY, body: merged.data },
      'config.publish',
      signal,
    )
    return published.ok ? ok({ version: published.value.version }) : published
  })
}
