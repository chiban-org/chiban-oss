import { refuseField } from '@/server/formInput'
import type { InvalidVariant } from '@/test/testHarness/actions'
import type { VariantKind } from '@/test/testHarness/actions/fields'

export type FieldCopy = string | ({ otherwise?: string } & Partial<Record<VariantKind, string>>)

export function refusalFor(copy: Record<string, FieldCopy>) {
  return (variant: InvalidVariant) => {
    const entry = copy[variant.field]
    const message =
      typeof entry === 'string' ? entry : (entry?.[variant.kind] ?? entry?.otherwise ?? '')
    return refuseField(variant.field, message)
  }
}

export function plainRefusalFor(copy: Record<string, FieldCopy>) {
  const withField = refusalFor(copy)
  return (variant: InvalidVariant) => {
    const { error } = withField(variant)
    return { ok: false as const, error }
  }
}
