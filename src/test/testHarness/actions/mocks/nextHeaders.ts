import { harnessState } from '../state'

interface CookieOptions {
  name?: string
  value?: string
}

function cookieJar() {
  const jar = harnessState.cookies
  return {
    get: (name: string) => {
      const value = jar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    has: (name: string) => jar.has(name),
    set: (nameOrCookie: string | CookieOptions, value?: string) => {
      const name = typeof nameOrCookie === 'string' ? nameOrCookie : (nameOrCookie.name ?? '')
      const stored = typeof nameOrCookie === 'string' ? value : nameOrCookie.value
      jar.set(name, stored ?? '')
    },
    delete: (name: string) => {
      jar.delete(name)
    },
  }
}

export function cookies() {
  return Promise.resolve(cookieJar())
}

export function headers(): Promise<Headers> {
  return Promise.resolve(new Headers([...harnessState.headers.entries()]))
}
