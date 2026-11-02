'use client'

import { useEditorContext } from '@/components/config/EditorContextProvider'
import { Check, Input, RowButton, rowKey } from '@/components/config/primitives'
import type { ReviewRoutesBody } from '@/features/reviews/routesSchema'

interface Props {
  body: ReviewRoutesBody
  onChange: (next: ReviewRoutesBody) => void
}

type Department = ReviewRoutesBody['departments'][number]
type Route = ReviewRoutesBody['routes'][number]

function keyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
}

function DepartmentRow({
  department,
  onChange,
  onRemove,
}: {
  department: Department
  onChange: (next: Department) => void
  onRemove: () => void
}) {
  const { reviewers } = useEditorContext()
  const toggle = (id: string, on: boolean) =>
    onChange({
      ...department,
      reviewerUserIds: on
        ? [...department.reviewerUserIds, id]
        : department.reviewerUserIds.filter((x) => x !== id),
    })
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Department</legend>
      <Input
        label="Department name"
        value={department.label}
        onChange={(e) =>
          onChange({ ...department, label: e.target.value, key: keyFromLabel(e.target.value) })
        }
      />
      <p className="text-sm font-medium">Reviewers, first active one is assigned</p>
      {reviewers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active reviewer accounts yet.</p>
      ) : (
        reviewers.map((r) => (
          <Check
            key={r.id}
            label={r.name}
            checked={department.reviewerUserIds.includes(r.id)}
            onChange={(e) => toggle(r.id, e.target.checked)}
          />
        ))
      )}
      <RowButton onClick={onRemove}>Remove department</RowButton>
    </fieldset>
  )
}

function RouteRow({
  route,
  departments,
  onChange,
  onRemove,
}: {
  route: Route
  departments: Department[]
  onChange: (next: Route) => void
  onRemove: () => void
}) {
  const toggle = (key: string, on: boolean) =>
    onChange({
      ...route,
      departmentKeys: on
        ? [...route.departmentKeys, key]
        : route.departmentKeys.filter((k) => k !== key),
    })
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Route</legend>
      <Input
        label="Application type"
        value={route.applicationTypeKey}
        onChange={(e) => onChange({ ...route, applicationTypeKey: e.target.value })}
      />
      <Input
        label="Comments due, days before the meeting"
        type="number"
        min={0}
        value={route.commentDueDaysBeforeMeeting}
        onChange={(e) =>
          onChange({ ...route, commentDueDaysBeforeMeeting: Number(e.target.value) })
        }
      />
      {departments.map((d) => (
        <Check
          key={d.key}
          label={d.label}
          checked={route.departmentKeys.includes(d.key)}
          onChange={(e) => toggle(d.key, e.target.checked)}
        />
      ))}
      <RowButton onClick={onRemove}>Remove route</RowButton>
    </fieldset>
  )
}

export function ReviewRoutesEditor({ body, onChange }: Props) {
  return (
    <div className="space-y-4">
      {body.departments.map((d, i) => (
        <DepartmentRow
          key={rowKey('department', i)}
          department={d}
          onChange={(next) =>
            onChange({ ...body, departments: body.departments.map((x, n) => (n === i ? next : x)) })
          }
          onRemove={() =>
            onChange({ ...body, departments: body.departments.filter((_, n) => n !== i) })
          }
        />
      ))}
      <RowButton
        onClick={() =>
          onChange({
            ...body,
            departments: [...body.departments, { key: '', label: '', reviewerUserIds: [] }],
          })
        }
      >
        Add department
      </RowButton>
      {body.routes.map((r, i) => (
        <RouteRow
          key={rowKey('route', i)}
          route={r}
          departments={body.departments}
          onChange={(next) =>
            onChange({ ...body, routes: body.routes.map((x, n) => (n === i ? next : x)) })
          }
          onRemove={() => onChange({ ...body, routes: body.routes.filter((_, n) => n !== i) })}
        />
      ))}
      <RowButton
        onClick={() =>
          onChange({
            ...body,
            routes: [
              ...body.routes,
              { applicationTypeKey: '', departmentKeys: [], commentDueDaysBeforeMeeting: 7 },
            ],
          })
        }
      >
        Add route
      </RowButton>
    </div>
  )
}
