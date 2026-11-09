import type { DbOrTx } from '@/db/client'
import { getPublished } from '@/features/config/store'
import {
  type NotificationWordingBody,
  NotificationWordingBodySchema,
} from '@/features/notifications/wording/wordingSchema'
import { loadPublicTown } from '@/features/town/publicTown'

export interface MessageSettings {
  townName: string
  wording: NotificationWordingBody['events']
}

export async function townName(db: DbOrTx, signal: AbortSignal): Promise<string> {
  return (await loadPublicTown(db, signal)).name
}

export async function publishedWording(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<NotificationWordingBody['events']> {
  const row = await getPublished(db, 'notification_wording', 'default', signal)
  const parsed = NotificationWordingBodySchema.safeParse(row?.body)
  return parsed.success ? parsed.data.events : {}
}

export async function loadMessageSettings(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<MessageSettings> {
  const [name, wording] = await Promise.all([townName(db, signal), publishedWording(db, signal)])
  return { townName: name, wording }
}
