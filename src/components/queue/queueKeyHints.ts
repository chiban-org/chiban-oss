import type { KeyHint } from '@/components/KeyHints'

export function queueKeyHints(canAssign: boolean): KeyHint[] {
  return [
    { keys: ['j', 'k'], action: 'move' },
    { keys: ['Enter'], action: 'open' },
    ...(canAssign ? [{ keys: ['a'], action: 'assign a reviewer' }] : []),
    { keys: ['/'], action: 'search' },
  ]
}
