import type { Db } from '@/db/client'

type Builder = Record<string, unknown>

function wrap(builder: Builder, inject: () => Promise<void>): Builder {
  return new Proxy(builder, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const next = (value as (...a: unknown[]) => unknown).apply(target, args)
        if (prop === 'limit') {
          return Promise.resolve(next).then(async (rows) => {
            await inject()
            return rows
          })
        }
        return wrap(next as Builder, inject)
      }
    },
  })
}

export function racyAfterFirstSelect(db: Db, inject: () => Promise<void>): Db {
  let fired = false
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== 'select') return Reflect.get(target, prop, receiver) as unknown
      return (...args: unknown[]) => {
        const builder = Reflect.apply(target.select, target, args) as Builder
        if (fired) return builder
        fired = true
        return wrap(builder, inject)
      }
    },
  })
}
