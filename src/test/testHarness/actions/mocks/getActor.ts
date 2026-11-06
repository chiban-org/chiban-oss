import type { Actor } from '@/features/auth/actor'
import { harnessState } from '../state'

export function getActor(): Promise<Actor | null> {
  return Promise.resolve(harnessState.actor)
}
