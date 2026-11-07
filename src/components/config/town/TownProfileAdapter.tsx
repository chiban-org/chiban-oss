'use client'

import { useEditorContext } from '@/components/config/EditorContextProvider'
import type { EditorProps } from '@/components/config/editorAdapters'
import type { FieldErrors } from '@/components/config/primitives'
import { LetterheadFields } from '@/components/config/town/LetterheadFields'
import { ProfileFields } from '@/components/config/town/ProfileFields'
import { SignersFields } from '@/components/config/town/SignersFields'
import type { TownProfileBody } from '@/features/town/profileSchema'

export function TownProfileAdapter({ body, onChange, issues }: EditorProps) {
  const typed = body as TownProfileBody
  const { boards } = useEditorContext()
  const errors: FieldErrors = Object.fromEntries(
    issues.map((i) => [i.path.split('.')[0] ?? i.path, i.message]),
  )
  return (
    <div className="grid gap-10">
      <ProfileFields body={typed} onChange={onChange} errors={errors} />
      <div className="grid gap-4">
        <h2 className="m-0">Letterhead</h2>
        <LetterheadFields body={typed} boards={boards} onChange={onChange} />
      </div>
      <div className="grid gap-4">
        <h2 className="m-0">Signers</h2>
        <SignersFields body={typed} onChange={onChange} errors={errors} />
      </div>
    </div>
  )
}
