import type { ReactNode } from 'react'
import { SelectField, TextField } from '@/components/staff/fields'
import { SERVER_ROLE_LABELS, SERVICE_METHOD_LABELS } from '@/features/enforcement/labels'
import {
  NAMED_SERVER_METHODS,
  SERVER_ROLE_METHODS,
  type ServiceMethod,
} from '@/features/enforcement/serviceStatus'

const METHODS = Object.entries(SERVICE_METHOD_LABELS) as [string, string][]
const SERVERS: [string, string][] = [
  ['', 'Choose'],
  ...(Object.entries(SERVER_ROLE_LABELS) as [string, string][]),
]

function ShownFor({
  methods,
  children,
}: {
  methods: readonly ServiceMethod[]
  children: ReactNode
}) {
  return <div data-shown-for={methods.join(' ')}>{children}</div>
}

export function ServiceMethodFields({ defaultMethod }: { defaultMethod: ServiceMethod }) {
  return (
    <div data-service-method="" className="contents">
      <SelectField label="Method" name="method" options={METHODS} defaultValue={defaultMethod} />
      <ShownFor methods={NAMED_SERVER_METHODS}>
        <TextField label="Served by (name)" name="serverName" />
      </ShownFor>
      <ShownFor methods={SERVER_ROLE_METHODS}>
        <SelectField label="Server is a" name="serverRole" options={SERVERS} />
      </ShownFor>
      <ShownFor methods={['newspaper_publication']}>
        <TextField label="Newspaper" name="newspaper" />
      </ShownFor>
    </div>
  )
}
