import { HarnessNotFound, HarnessRedirect } from '../outcome'

export function redirect(url: string): never {
  throw new HarnessRedirect(url)
}

export function permanentRedirect(url: string): never {
  throw new HarnessRedirect(url)
}

export function notFound(): never {
  throw new HarnessNotFound()
}

export function useRouter() {
  return { refresh: () => undefined, push: () => undefined, replace: () => undefined }
}
