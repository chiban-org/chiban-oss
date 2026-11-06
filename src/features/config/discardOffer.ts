import type { ActionResult } from '@/server/actionRunner'

export type DiscardAction = (formData: FormData) => Promise<ActionResult>

export function discardOffer(
  versions: { status: string }[],
  action: DiscardAction,
): { discard?: { neverPublished: boolean; action: DiscardAction } } {
  if (!versions.some((v) => v.status === 'draft')) return {}
  const neverPublished = !versions.some((v) => v.status !== 'draft')
  return { discard: { neverPublished, action } }
}
