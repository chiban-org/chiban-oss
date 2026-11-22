export interface Mailbox {
  name: string
  address: string
}

export interface SenderSource {
  mailFrom: string | undefined
  baseUrl: string
  townName: () => Promise<string>
}

export function parseMailbox(value: string, fallbackName: string): Mailbox {
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value)
  if (match === null) return { name: fallbackName, address: value.trim() }
  const name = (match[1] ?? '').replace(/^"|"$/g, '').trim()
  return { name: name === '' ? fallbackName : name, address: (match[2] ?? '').trim() }
}

const PLAIN_NAME = /^[A-Za-z0-9 ]+$/

export function formatMailbox({ name, address }: Mailbox): string {
  const trimmed = name.trim()
  if (trimmed === '') return address
  const shown = PLAIN_NAME.test(trimmed) ? trimmed : `"${trimmed.replace(/(["\\])/g, '\\$1')}"`
  return `${shown} <${address}>`
}

function hasDisplayName(value: string): boolean {
  return /<[^<>]+>/.test(value) && parseMailbox(value, '').name !== ''
}

export async function resolveSender(source: SenderSource): Promise<string> {
  const configured = source.mailFrom?.trim() ?? ''
  if (hasDisplayName(configured)) return configured
  const address =
    configured === ''
      ? `noreply@${new URL(source.baseUrl).hostname}`
      : parseMailbox(configured, '').address
  return formatMailbox({ name: await source.townName(), address })
}
