import { permanentRedirect } from 'next/navigation'

export default function OldCamaImportPath(): never {
  permanentRedirect('/staff/gis/imports/cama')
}
