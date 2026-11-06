import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

const DEFAULT_PORT = '3100'
const DEFAULT_MAILPIT_PORT = '8025'
const DOT_ENV = path.resolve('.env')

function readDotEnv(): Record<string, string | undefined> {
  if (!existsSync(DOT_ENV)) {
    throw new Error(`e2e reads the dev settings in ${DOT_ENV}; create it from .env.example first`)
  }
  return parseEnv(readFileSync(DOT_ENV, 'utf8'))
}

function portFrom(name: string, raw: string | undefined, fallback: string): number {
  const port = Number(raw === undefined || raw === '' ? fallback : raw)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} must be a port number, got "${raw}"`)
  }
  return port
}

function databaseUrlFor(devUrl: string | undefined, name: string): string {
  if (devUrl === undefined) throw new Error('.env has no DATABASE_URL to derive e2e databases from')
  const url = new URL(devUrl)
  url.pathname = `/${name}`
  return url.toString()
}

const dotEnv = readDotEnv()

export const E2E_PORT = portFrom('E2E_PORT', process.env.E2E_PORT, DEFAULT_PORT)
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`
export const E2E_DATABASE_NAME = `chiban_e2e_${E2E_PORT}`
export const E2E_DATABASE_URL = databaseUrlFor(dotEnv.DATABASE_URL, E2E_DATABASE_NAME)
export const E2E_MAINTENANCE_DATABASE_URL = databaseUrlFor(dotEnv.DATABASE_URL, 'postgres')
export const E2E_S3_BUCKET = `chiban-e2e-${E2E_PORT}`
export const MAILPIT_URL = `http://localhost:${portFrom('MAILPIT_UI_PORT', dotEnv.MAILPIT_UI_PORT, DEFAULT_MAILPIT_PORT)}`
export const E2E_STAFF_PASSWORD = 'alder-pond-e2e-password'
export const E2E_AUTH_DIR = path.resolve('e2e/.auth')

export const E2E_SERVER_ENV: Readonly<Record<string, string>> = {
  DATABASE_URL: E2E_DATABASE_URL,
  BASE_URL: E2E_BASE_URL,
  PORT: String(E2E_PORT),
  S3_BUCKET: E2E_S3_BUCKET,
}
