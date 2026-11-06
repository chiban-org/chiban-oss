import { setTimeout as sleep } from 'node:timers/promises'
import { MAILPIT_URL } from './settings'

export interface MailMessage {
  id: string
  subject: string
  text: string
  html: string
  receivedAt: Date
}

export interface MailQuery {
  to: string
  since: Date
  subject?: string
  containing?: string
  timeoutMs?: number
}

interface SearchHit {
  ID: string
  Subject: string
  Created: string
}

const POLL_MS = 250
const DEFAULT_TIMEOUT_MS = 15_000

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`)
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${response.status}`)
  return (await response.json()) as T
}

async function load(hit: SearchHit): Promise<MailMessage> {
  const full = await getJson<{ Text: string; HTML: string }>(`/api/v1/message/${hit.ID}`)
  return {
    id: hit.ID,
    subject: hit.Subject,
    text: full.Text,
    html: full.HTML,
    receivedAt: new Date(hit.Created),
  }
}

async function findMatch(query: MailQuery): Promise<MailMessage | null> {
  const terms = [`to:"${query.to}"`]
  if (query.subject !== undefined) terms.push(`subject:"${query.subject}"`)
  const search = encodeURIComponent(terms.join(' '))
  const found = await getJson<{ messages: SearchHit[] }>(`/api/v1/search?query=${search}&limit=50`)
  for (const hit of found.messages.filter((m) => new Date(m.Created) >= query.since)) {
    const message = await load(hit)
    if (query.containing === undefined || message.text.includes(query.containing)) return message
  }
  return null
}

export async function waitForEmail(query: MailQuery): Promise<MailMessage> {
  const deadline = Date.now() + (query.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  for (;;) {
    const message = await findMatch(query)
    if (message !== null) return message
    if (Date.now() > deadline) {
      throw new Error(`no email to ${query.to} since ${query.since.toISOString()} in Mailpit`)
    }
    await sleep(POLL_MS)
  }
}

export function linkIn(message: MailMessage, prefix: string): string {
  const link = message.text.split(/\s+/).find((word) => word.startsWith(prefix))
  if (link === undefined) throw new Error(`no link starting ${prefix} in "${message.subject}"`)
  return link
}
