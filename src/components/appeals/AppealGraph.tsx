import { StatusChip } from '@/components/StatusChip'

export interface GraphNode {
  nodeId: string
  kindLabel: string
  dateText: string
  outcomeText: string | null
  status: 'open' | 'resolved' | 'withdrawn' | 'stayed'
  untimely: boolean
  parentId: string | null
  window: { label: string; dueText: string; consequence: string } | null
}

const STATUS_CHIP = {
  stayed: { status: 'overdue', label: 'Stayed' },
  withdrawn: { status: 'neutral', label: 'Withdrawn' },
} as const

function Node({ node, all }: { node: GraphNode; all: GraphNode[] }) {
  const children = all.filter((n) => n.parentId === node.nodeId)
  return (
    <li className="space-y-1">
      <p className="m-0 font-semibold">{node.kindLabel}</p>
      <p className="m-0 text-sm">
        {node.dateText}
        {node.outcomeText === null ? '' : `, ${node.outcomeText}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {node.status === 'stayed' || node.status === 'withdrawn' ? (
          <StatusChip
            status={STATUS_CHIP[node.status].status}
            label={STATUS_CHIP[node.status].label}
          />
        ) : null}
        {node.untimely ? <StatusChip status="failed" label="Filed late" /> : null}
      </div>
      {node.window === null ? null : (
        <p className="m-0 text-sm">
          {`${node.window.label}, due ${node.window.dueText}. ${node.window.consequence}`}
        </p>
      )}
      {children.length === 0 ? null : (
        <ul className="m-0 list-none space-y-3 border-l pl-4 pt-2">
          {children.map((child) => (
            <Node key={child.nodeId} node={child} all={all} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function AppealGraph({ nodes }: { nodes: GraphNode[] }) {
  const roots = nodes.filter(
    (n) => n.parentId === null || !nodes.some((o) => o.nodeId === n.parentId),
  )
  if (nodes.length === 0) return <p>No decisions or appeals are recorded yet.</p>
  return (
    <ul aria-label="Appeal graph" className="m-0 list-none space-y-4 p-0">
      {roots.map((root) => (
        <Node key={root.nodeId} node={root} all={nodes} />
      ))}
    </ul>
  )
}
