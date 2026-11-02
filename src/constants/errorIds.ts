export const ErrorIds = {
  CFG_MISSING: 'E_CFG_001',
  CFG_INVALID_JSON: 'E_CFG_002',
  CFG_SCHEMA_FAIL: 'E_CFG_003',
  CFG_ENV_MISSING: 'E_CFG_004',

  FS_NOT_FOUND: 'E_FS_001',
  FS_PERMISSION: 'E_FS_002',
  FS_DISK_FULL: 'E_FS_003',
  FS_READ_FAIL: 'E_FS_004',
  FS_WRITE_FAIL: 'E_FS_005',

  NET_TIMEOUT: 'E_NET_001',
  NET_DNS: 'E_NET_002',
  NET_TLS: 'E_NET_003',
  NET_RATE_LIMITED: 'E_NET_004',
  NET_UNAVAILABLE: 'E_NET_005',
  NET_BAD_SHAPE: 'E_NET_006',

  DB_QUERY_FAIL: 'E_DB_001',
  DB_MIGRATION_FAIL: 'E_DB_002',
  DB_INVARIANT: 'E_DB_003',

  AUTH_SESSION_INVALID: 'E_AUTH_001',
  AUTH_CSRF: 'E_AUTH_002',
  AUTH_CREDENTIALS: 'E_AUTH_003',

  AUTHZ_FORBIDDEN: 'E_AUTHZ_001',
  AUTHZ_UNKNOWN_CAPABILITY: 'E_AUTHZ_002',

  JOB_BOSS_MISSING: 'E_JOB_001',
  JOB_HANDLER_FAIL: 'E_JOB_002',
  JOB_UNKNOWN: 'E_JOB_003',

  SEC_UNKNOWN_KEY: 'E_SEC_001',
  SEC_TAMPERED: 'E_SEC_002',
  SEC_MALFORMED: 'E_SEC_003',
} as const

export type ErrorId = (typeof ErrorIds)[keyof typeof ErrorIds]

export class AppError extends Error {
  readonly id: ErrorId
  readonly context: Record<string, unknown>

  constructor(id: ErrorId, message: string, context: Record<string, unknown> = {}) {
    super(message)
    this.id = id
    this.context = context
    this.name = 'AppError'
  }

  toLogLine(): string {
    const ctx = Object.entries(this.context)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ')
    return `[${this.id}] ${this.message}${ctx ? ` ${ctx}` : ''}`
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
