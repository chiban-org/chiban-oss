import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { ImportUploadForm } from '@/components/staff/ImportUploadForm'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import { runLayerRefreshAction } from './actions'

interface LayerImportActionProps {
  layerKey: LayerKey
  remote: boolean
}

export function LayerImportAction({ layerKey, remote }: LayerImportActionProps) {
  if (layerKey === 'cama') {
    return (
      <p>
        <Link href="/staff/gis/imports/cama" className="text-action underline">
          Open the CAMA owner import
        </Link>
      </p>
    )
  }
  if (remote) {
    return (
      <ActionForm
        action={runLayerRefreshAction}
        submitLabel="Run import"
        variant={layerKey === 'parcels' ? 'default' : 'outline'}
      >
        <input type="hidden" name="key" value={layerKey} />
      </ActionForm>
    )
  }
  return <ImportUploadForm layerKey={layerKey} primary={layerKey === 'parcels'} />
}
