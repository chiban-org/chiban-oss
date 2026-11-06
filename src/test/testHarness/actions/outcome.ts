export class HarnessRedirect extends Error {
  readonly url: string
  constructor(url: string) {
    super(`NEXT_REDIRECT:${url}`)
    this.url = url
  }
}

export class HarnessNotFound extends Error {
  constructor() {
    super('NEXT_NOT_FOUND')
  }
}

export interface Redirected {
  redirectsTo: string
}

export interface NotFound {
  notFound: true
}

export type Outcome<R> = R | Redirected | NotFound

export function redirectsTo(url: string): Redirected {
  return { redirectsTo: url }
}

export async function settle<R>(pending: Promise<R>): Promise<Outcome<R>> {
  try {
    return await pending
  } catch (e) {
    if (e instanceof HarnessRedirect) return { redirectsTo: e.url }
    if (e instanceof HarnessNotFound) return { notFound: true }
    throw e
  }
}
