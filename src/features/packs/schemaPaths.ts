interface ZodDef {
  type: string
  shape?: Record<string, { _zod: { def: ZodDef } }>
  options?: { _zod: { def: ZodDef } }[]
  element?: { _zod: { def: ZodDef } }
  innerType?: { _zod: { def: ZodDef } }
  in?: { _zod: { def: ZodDef } }
}

type ZodLike = { _zod: { def: ZodDef } }

function join(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}.${key}`
}

function walk(node: ZodLike, prefix: string, out: Set<string>): void {
  const def = node._zod.def
  if (def.type === 'object' && def.shape !== undefined) {
    for (const [key, child] of Object.entries(def.shape)) walk(child, join(prefix, key), out)
    return
  }
  if (def.type === 'union' && def.options !== undefined) {
    for (const option of def.options) walk(option, prefix, out)
    return
  }
  if (def.type === 'array' && def.element !== undefined) {
    if (def.element._zod.def.type === 'object') walk(def.element, prefix, out)
    else out.add(prefix)
    return
  }
  if ((def.type === 'optional' || def.type === 'nullable') && def.innerType !== undefined) {
    walk(def.innerType, prefix, out)
    return
  }
  if (def.type === 'pipe' && def.in !== undefined) {
    walk(def.in, prefix, out)
    return
  }
  out.add(prefix)
}

export function leafPaths(schema: unknown): string[] {
  const out = new Set<string>()
  walk(schema as ZodLike, '', out)
  return [...out].sort()
}
