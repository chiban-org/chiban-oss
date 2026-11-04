import type { FieldReference } from '@/features/forms/formReferences'

export function ReferenceList({ references }: { references: FieldReference[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {references.map((ref) => (
        <li key={`${ref.source}:${ref.detail}`} className="text-sm">
          <span className="block font-medium">{ref.source}</span>
          <span className="block text-muted-foreground">{ref.detail}</span>
        </li>
      ))}
    </ul>
  )
}
