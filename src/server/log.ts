import { LOG_LEVELS, type LogLevel } from '@/config/envSchema'

let threshold: LogLevel = 'info'

export function setLogLevel(level: LogLevel): void {
  threshold = level
}

function text(part: unknown): string {
  if (typeof part === 'string') return part
  if (part instanceof Error) return part.message
  return typeof part === 'object' && part !== null ? JSON.stringify(part) : String(part)
}

function emitter(level: LogLevel, stream: NodeJS.WriteStream) {
  return (...parts: unknown[]): void => {
    if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(threshold)) return
    stream.write(`${parts.map(text).join(' ')}\n`)
  }
}

export const log = {
  debug: emitter('debug', process.stdout),
  info: emitter('info', process.stdout),
  warn: emitter('warn', process.stderr),
  error: emitter('error', process.stderr),
}
