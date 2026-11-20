import { boardShort } from '@/features/packs/vocabulary'

export function appealToBoard(): string {
  return `Appeal to the ${boardShort('zba')}`
}

export function boardDecision(): string {
  return `${boardShort('zba')} decision`
}
