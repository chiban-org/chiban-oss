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

function children(def: ZodDef, prefix: string): [ZodLike, string][] | null {
  if (def.type === 'object' && def.shape !== undefined) {
    return Object.entries(def.shape).map(([key, child]) => [child, join(prefix, key)])
  }
  if (def.type === 'union' && def.options !== undefined) {
    return def.options.map((option) => [option, prefix])
  }
  if (def.type === 'array' && def.element?._zod.def.type === 'object') {
    return [[def.element, prefix]]
  }
  if ((def.type === 'optional' || def.type === 'nullable') && def.innerType !== undefined) {
    return [[def.innerType, prefix]]
  }
  if (def.type === 'pipe' && def.in !== undefined) return [[def.in, prefix]]
  return null
}

function walk(node: ZodLike, prefix: string, out: Set<string>): void {
  const next = children(node._zod.def, prefix)
  if (next === null) {
    out.add(prefix)
    return
  }
  for (const [child, childPrefix] of next) walk(child, childPrefix, out)
}

export function leafPaths(schema: unknown): string[] {
  const out = new Set<string>()
  walk(schema as ZodLike, '', out)
  return [...out].sort()
}
