import { TextField } from '@/components/staff/fields'
import type { ExportTargetView } from '@/features/export/targets/manageTargets'

interface Props {
  kind: ExportTargetView['kind']
  idPrefix: string
  current?: ExportTargetView
}

function settingOf(current: ExportTargetView | undefined, key: string): string {
  const settings = (current?.settings ?? {}) as Record<string, unknown>
  const value = settings[key]
  return typeof value === 'string' ? value : ''
}

function Field(props: {
  idPrefix: string
  name: string
  label: string
  current?: ExportTargetView | undefined
  secret?: boolean
  type?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
}) {
  const id = `${props.idPrefix}-${props.name}`
  const value =
    props.secret === true ? '' : (props.defaultValue ?? settingOf(props.current, props.name))
  return (
    <TextField
      id={id}
      label={props.label}
      name={props.name}
      type={props.type ?? 'text'}
      defaultValue={value}
      autoComplete="off"
      required={props.required ?? props.current === undefined}
      {...(props.placeholder === undefined ? {} : { placeholder: props.placeholder })}
    />
  )
}

export function TargetFields({ kind, idPrefix, current }: Props) {
  const editing = current !== undefined
  const keep = editing ? 'Leave blank to keep the saved value' : undefined
  const base = { idPrefix, current }
  return (
    <div className="max-w-md space-y-4">
      <input type="hidden" name="kind" value={kind} />
      {editing ? <input type="hidden" name="id" value={current.id} /> : null}
      <Field {...base} name="name" label="Name" required defaultValue={current?.name ?? ''} />
      <Field
        {...base}
        name="dayOfMonth"
        label="Day of the month to copy (1 to 28)"
        type="number"
        required
        defaultValue={String(current?.dayOfMonth ?? 1)}
      />
      {kind === 'local_fs' ? (
        <Field {...base} name="root" label="Folder on the server (full path)" />
      ) : null}
      {kind === 's3' ? (
        <>
          <Field {...base} name="endpoint" label="Storage address (URL)" />
          <Field {...base} name="bucket" label="Bucket" />
          <Field
            {...base}
            name="prefix"
            label="Folder inside the bucket (optional)"
            required={false}
          />
          <Field {...base} name="region" label="Region" />
          <Field
            {...base}
            name="accessKeyId"
            label="Access key ID"
            secret
            required={!editing}
            {...(keep ? { placeholder: keep } : {})}
          />
          <Field
            {...base}
            name="secretAccessKey"
            label="Secret access key"
            secret
            type="password"
            required={!editing}
            {...(keep ? { placeholder: keep } : {})}
          />
        </>
      ) : null}
      {kind === 'onedrive' ? (
        <>
          <Field {...base} name="tenantId" label="Microsoft 365 tenant ID" />
          <Field {...base} name="clientId" label="App registration (client) ID" />
          <Field {...base} name="driveId" label="Drive ID" />
          <Field
            {...base}
            name="clientSecret"
            label="Client secret"
            secret
            type="password"
            required={!editing}
            {...(keep ? { placeholder: keep } : {})}
          />
        </>
      ) : null}
    </div>
  )
}
