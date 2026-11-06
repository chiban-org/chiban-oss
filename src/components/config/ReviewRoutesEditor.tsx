'use client'

import { useEditorContext } from '@/components/config/EditorContextProvider'
import { NamePicker } from '@/components/config/plainFields'
import { Check, Input, RowButton, rowKey } from '@/components/config/primitives'
import { Legend } from '@/components/ui/legend'
import { NO_REFERENCE_CHOICES } from '@/features/config/referenceChoices'
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
      <Legend bordered>Department</Legend>
      <Input
        label="Department name"
        value={department.label}
        onChange={(e) =>
          onChange({ ...department, label: e.target.value, key: keyFromLabel(e.target.value) })
        }
      />
      <p className="text-sm font-medium">Reviewers</p>
      <p className="text-sm text-muted-foreground">
        The first ticked reviewer whose account is active gets each request.
      </p>
      {reviewers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active reviewer accounts yet. Invite reviewers under Users first.
        </p>
      ) : (
        reviewers.map((r) => (
          <Check
            key={r.id}
            label={r.name}
            checked={department.reviewerUserIds.includes(r.id)}
            onChange={(checked) => toggle(r.id, checked)}
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
  const applicationTypes = (useEditorContext().references ?? NO_REFERENCE_CHOICES).application_type
  const toggle = (key: string, on: boolean) =>
    onChange({
      ...route,
      departmentKeys: on
        ? [...route.departmentKeys, key]
        : route.departmentKeys.filter((k) => k !== key),
    })
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <Legend bordered>Route</Legend>
      <NamePicker
        label="Application type"
        value={route.applicationTypeKey}
        choices={applicationTypes}
        onChange={(applicationTypeKey) => onChange({ ...route, applicationTypeKey })}
      />
      <Input
        label="Comments due, days before the meeting"
        hint="Reviewers are asked to comment this many days before the board meets."
        type="number"
        min={0}
        value={route.commentDueDaysBeforeMeeting}
        onChange={(e) =>
          onChange({ ...route, commentDueDaysBeforeMeeting: Number(e.target.value) })
        }
      />
      <p className="text-sm font-medium">Departments asked to review</p>
      {departments.map((d) => (
        <Check
          key={d.key}
          label={d.label}
          checked={route.departmentKeys.includes(d.key)}
          onChange={(checked) => toggle(d.key, checked)}
        />
      ))}
      <RowButton onClick={onRemove}>Remove route</RowButton>
    </fieldset>
  )
}

function renameDepartment(body: ReviewRoutesBody, index: number, next: Department) {
  const previous = body.departments[index]?.key
  const routes =
    previous === undefined || previous === next.key
      ? body.routes
      : body.routes.map((route) => ({
          ...route,
          departmentKeys: route.departmentKeys.map((k) => (k === previous ? next.key : k)),
        }))
  return {
    ...body,
    routes,
    departments: body.departments.map((x, n) => (n === index ? next : x)),
  }
}

export function ReviewRoutesEditor({ body, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg">Departments</h2>
      {body.departments.map((d, i) => (
        <DepartmentRow
          key={rowKey('department', i)}
          department={d}
          onChange={(next) => onChange(renameDepartment(body, i, next))}
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
      <h2 className="text-lg">Which departments review each type</h2>
      {body.routes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No routes yet. Add one for each kind of application the committee reviews.
        </p>
      ) : null}
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
