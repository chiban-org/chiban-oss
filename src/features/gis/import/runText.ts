import { formatInstant } from '@/lib/formatDate'
import { words } from '@/lib/words'

export function importRunSummary(
  run: { layerKey: string; adapter: string; startedAt: Date; status: string },
  timeZone: string,
): string {
  return `${run.layerKey} from ${run.adapter}, started ${formatInstant(run.startedAt, timeZone)}. Status: ${words(run.status)}.`
}

export function exceptionDetailText(detail: string, createdAt: Date, timeZone: string): string {
  return `${detail}. First seen ${formatInstant(createdAt, timeZone)}.`
}
