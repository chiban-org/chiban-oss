'use client'

import {
  FieldError,
  type FieldErrors,
  Input,
  Pick,
  RowButton,
  rowKey,
} from '@/components/config/primitives'
import { ImageUpload } from '@/components/config/town/ImageUpload'
import {
  SIGNER_ROLE_LABELS,
  SIGNER_ROLES,
  type Signer,
  type SignerRole,
  type TownProfileBody,
} from '@/features/town/profileSchema'

interface Props {
  body: TownProfileBody
  onChange: (next: TownProfileBody) => void
  errors: FieldErrors
}

function roleLabel(role: SignerRole): string {
  return new Map(Object.entries(SIGNER_ROLE_LABELS)).get(role) ?? role
}

function SignerRow({
  signer,
  taken,
  onChange,
  onRemove,
}: {
  signer: Signer
  taken: ReadonlySet<SignerRole>
  onChange: (next: Signer) => void
  onRemove: () => void
}) {
  const roles = SIGNER_ROLES.filter((r) => r === signer.role || !taken.has(r))
  return (
    <li className="record-item grid gap-3 py-4">
      <Pick
        label="Signs as"
        value={signer.role}
        options={roles.map((r) => [r, roleLabel(r)] as [string, string])}
        onChange={(e) => {
          const role = SIGNER_ROLES.find((r) => r === e.target.value)
          if (role !== undefined) onChange({ ...signer, role })
        }}
        action={<RowButton onClick={onRemove}>Remove signer</RowButton>}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Name"
          value={signer.name}
          onChange={(e) => onChange({ ...signer, name: e.target.value })}
          required
        />
        <Input
          label="Title as printed"
          value={signer.title}
          onChange={(e) => onChange({ ...signer, title: e.target.value })}
          required
        />
      </div>
      <ImageUpload
        label={`Signature for ${signer.name === '' ? roleLabel(signer.role) : signer.name}`}
        hint="Optional. A PNG or JPEG of the signature on a white or clear background, up to 2 MB."
        image={signer.signature}
        onChange={(signature) => onChange({ ...signer, signature })}
        previewClassName="max-h-12 max-w-48 rounded border border-hairline bg-surface p-1"
      />
    </li>
  )
}

export function SignersFields({ body, onChange, errors }: Props) {
  const taken = new Set(body.signers.map((s) => s.role))
  const free = SIGNER_ROLES.filter((r) => !taken.has(r))
  const setSigners = (signers: Signer[]) => onChange({ ...body, signers })
  return (
    <div className="grid gap-3">
      {body.signers.length === 0 ? (
        <p className="m-0 text-muted-foreground">
          No signers yet. Documents show a blank signature line until you add one.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {body.signers.map((signer, index) => (
            <SignerRow
              key={rowKey('signer', index)}
              signer={signer}
              taken={taken}
              onChange={(next) => setSigners(body.signers.map((s, i) => (i === index ? next : s)))}
              onRemove={() => setSigners(body.signers.filter((_, i) => i !== index))}
            />
          ))}
        </ul>
      )}
      <FieldError errors={errors} name="signers" />
      {free[0] === undefined ? null : (
        <div>
          <RowButton
            onClick={() =>
              setSigners([
                ...body.signers,
                { role: free[0] ?? 'town_clerk', name: '', title: '', signature: null },
              ])
            }
          >
            Add a signer
          </RowButton>
        </div>
      )}
    </div>
  )
}
