import type { violationNotices } from '@/db/schema'

export function noticeOfViolationSent(
  notices: readonly Pick<typeof violationNotices.$inferSelect, 'id'>[],
): boolean {
  return notices.length > 0
}
