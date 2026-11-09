import type { DbOrTx } from '@/db/client'
import type { ProcessorAccountRow } from '@/db/schema'
import { getActiveProcessor } from '@/features/payments/processorAccounts'

export type CardReader =
  | { available: true; simulated: boolean }
  | { available: false; reason: string }

const NO_PROCESSOR: CardReader = {
  available: false,
  reason: 'Card at the counter is off because no card processor is set up in Payment settings.',
}

const NO_DEVICE: CardReader = {
  available: false,
  reason: 'Card at the counter is off because no card reader device is set up in Payment settings.',
}

function hasDevice(settings: unknown): boolean {
  if (typeof settings !== 'object' || settings === null) return false
  const deviceId: unknown = new Map(Object.entries(settings)).get('deviceId')
  return typeof deviceId === 'string' && deviceId.trim() !== ''
}

export function cardReaderFor(
  account: Pick<ProcessorAccountRow, 'processor' | 'settings'> | null,
): CardReader {
  if (account === null) return NO_PROCESSOR
  if (account.processor === 'simulated') return { available: true, simulated: true }
  return hasDevice(account.settings) ? { available: true, simulated: false } : NO_DEVICE
}

export async function loadCardReader(db: DbOrTx, signal: AbortSignal): Promise<CardReader> {
  const processor = await getActiveProcessor(db, signal)
  return cardReaderFor(processor.state === 'known' ? processor.value.account : null)
}
