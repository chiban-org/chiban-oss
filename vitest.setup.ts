const mutableEnv = process.env as Record<string, string | undefined>
mutableEnv.NODE_ENV ??= 'test'
mutableEnv.DATABASE_URL ??= 'postgres://placeholder:placeholder@localhost:5432/placeholder'
mutableEnv.BASE_URL = mutableEnv.BASE_URL?.startsWith('http')
  ? mutableEnv.BASE_URL
  : 'https://alderpond.example'
mutableEnv.CHIBAN_SECRET_KEYS ??= JSON.stringify({ k1: Buffer.alloc(32, 7).toString('base64') })
mutableEnv.CHIBAN_ACTIVE_KEY_ID ??= 'k1'

export {}
