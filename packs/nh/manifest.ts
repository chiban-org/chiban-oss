export interface PackManifest {
  id: string
  version: string
  rules: readonly unknown[]
}

export const NH_PACK_MANIFEST: PackManifest = { id: 'nh', version: '0.1.0', rules: [] }
