const mutableEnv = process.env as Record<string, string | undefined>
mutableEnv.NODE_ENV ??= 'test'
mutableEnv.DATABASE_URL ??= 'postgres://placeholder:placeholder@localhost:5432/placeholder'
mutableEnv.BASE_URL = mutableEnv.BASE_URL?.startsWith('http')
  ? mutableEnv.BASE_URL
  : 'https://alderpond.example'

export {}
