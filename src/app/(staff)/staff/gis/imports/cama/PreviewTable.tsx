import { StatusChip } from '@/components/StatusChip'
import type { CamaPreview, CamaRowStatus } from '@/features/cama/previewCama'

const STATUS_WORDS: Record<CamaRowStatus, string> = {
  resolves: 'Matches a parcel',
  unknown: 'No such parcel',
  retired: 'Retired parcel',
  invalid: 'ID cannot be composed',
}

export function PreviewTable({ preview }: { preview: CamaPreview }) {
  return (
    <div className="my-4 overflow-x-auto">
      <p className="text-sm">{`Showing ${preview.rows.length} of ${preview.totalRows} rows.`}</p>
      <table className="w-full border-separate border-spacing-x-4 text-sm">
        <thead>
          <tr>
            <th className="pl-0">Line</th>
            <th>Composed ID</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Mailing address</th>
            <th>Site address</th>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row) => (
            <tr key={row.line}>
              <td>{row.line}</td>
              <td>{row.id ?? 'None'}</td>
              <td>
                <StatusChip
                  status={row.status === 'resolves' ? 'passed' : 'failed'}
                  label={STATUS_WORDS[row.status]}
                />
              </td>
              <td>{row.ownerName ?? 'Blank'}</td>
              <td>{row.mailingAddress ?? 'Blank'}</td>
              <td>{row.siteAddress ?? 'Blank'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
