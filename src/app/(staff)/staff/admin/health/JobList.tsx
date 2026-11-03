import { splitJobs } from '@/features/health/jobAttention'
import type { JobHealthRow } from '@/features/health/jobHealth'
import { jobLabel } from '@/features/health/jobLabels'

function problemOf(job: JobHealthRow): string {
  return job.stale ? 'Overdue' : 'Last run failed'
}

function AttentionCard({ job, day }: { job: JobHealthRow; day: (d: Date | null) => string }) {
  return (
    <li className="rounded-md border border-status-failed-fg/40 bg-surface p-3">
      <p className="m-0 font-medium">{`${jobLabel(job.name)}: ${problemOf(job)}`}</p>
      <p className="m-0">Last success: {day(job.lastSuccessAt)}</p>
      {job.lastFailureAt === null ? null : (
        <p className="m-0">Last failure: {day(job.lastFailureAt)}</p>
      )}
    </li>
  )
}

export function JobList({
  jobs,
  day,
}: {
  jobs: readonly JobHealthRow[]
  day: (d: Date | null) => string
}) {
  const { attention, rest } = splitJobs(jobs)
  const anyFailure = rest.some((job) => job.lastFailureAt !== null)
  return (
    <>
      {attention.length === 0 ? null : (
        <>
          <h3>Needs attention</h3>
          <ul className="m-0 list-none space-y-2 p-0">
            {attention.map((job) => (
              <AttentionCard key={job.name} job={job} day={day} />
            ))}
          </ul>
        </>
      )}
      {rest.length === 0 ? null : (
        <div className="table-panel my-3">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Last success</th>
                {anyFailure ? <th scope="col">Last failure</th> : null}
              </tr>
            </thead>
            <tbody>
              {rest.map((job) => (
                <tr key={job.name}>
                  <td>{jobLabel(job.name)}</td>
                  <td>{day(job.lastSuccessAt)}</td>
                  {anyFailure ? (
                    <td>{job.lastFailureAt === null ? '' : day(job.lastFailureAt)}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
