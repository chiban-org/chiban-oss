import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import {
  TOWN_ASSET_PREFIX,
  TOWN_PROFILE_SKELETON,
  type TownImage,
  type TownProfileBody,
  TownProfileBodySchema,
} from '@/features/town/profileSchema'
import { getTownSettings } from '@/features/town/settings'

export interface TownOffice {
  officeName: string
  addressLines: string[]
  phone: string
  email: string
  officeHours: string
}

export interface PublicTown {
  name: string
  office: TownOffice
  logo: { src: string; width: number; height: number } | null
}

const EXTENSIONS: Record<TownImage['contentType'], 'png' | 'jpg'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

async function publishedProfile(db: DbOrTx, signal: AbortSignal): Promise<TownProfileBody> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ body: configVersions.body })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.kind, 'town_profile'),
        eq(configVersions.key, 'default'),
        eq(configVersions.status, 'published'),
      ),
    )
  const parsed = TownProfileBodySchema.safeParse(row?.body)
  return parsed.success ? parsed.data : TOWN_PROFILE_SKELETON
}

function shaOf(image: TownImage): string {
  return image.objectKey.slice(TOWN_ASSET_PREFIX.length)
}

export async function loadPublicTown(db: DbOrTx, signal: AbortSignal): Promise<PublicTown> {
  const [settings, profile] = await Promise.all([
    getTownSettings(db, signal),
    publishedProfile(db, signal),
  ])
  const { logo } = profile
  return {
    name: settings.ok ? settings.value.name : profile.officeName,
    office: {
      officeName: profile.officeName,
      addressLines: profile.addressLines,
      phone: profile.phone,
      email: profile.email,
      officeHours: profile.officeHours,
    },
    logo:
      logo === null
        ? null
        : {
            src: `/town-logo/${shaOf(logo)}.${EXTENSIONS[logo.contentType]}`,
            width: logo.width,
            height: logo.height,
          },
  }
}

export async function publicLogoFor(
  db: DbOrTx,
  sha: string,
  signal: AbortSignal,
): Promise<{ sha: string; extension: 'png' | 'jpg' } | null> {
  const { logo } = await publishedProfile(db, signal)
  if (logo === null || shaOf(logo) !== sha) return null
  return { sha, extension: EXTENSIONS[logo.contentType] }
}

export function townWithoutAssetRequests(town: PublicTown): PublicTown {
  return { ...town, logo: null }
}
