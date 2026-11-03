import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { CENSUS_EXCLUDED_REASONS } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { censusBpsReport, incompleteCopy } from '@/features/census/bpsReport'
import {
  CENSUS_CATEGORY_LABELS,
  CENSUS_PHASE_LABELS,
  CENSUS_REASON_LABELS,
} from '@/features/census/labels'
import { type CensusSuggestion, suggestCensus } from '@/features/census/suggest'
import { firstParam, type RawSearchParams, readTableParams } from '@/features/dataTable/params'
import {
  CENSUS_PATH,
  LARGE_PERMIT_SORT,
  LARGE_SCOPE,
  sortLargePermits,
} from '@/features/reports/reportSorts'
import { activeSortFields, scopedSort } from '@/features/staffTables/scopedSort'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { classifyCensusAction } from './actions'

export const dynamic = 'force-dynamic'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const EMPTY: CensusSuggestion = {
  category: 'single_family',
  excludedReason: null,
  phase: 'whole_building',
  buildings: 1,
  housingUnits: 1,
  valuationDollars: 0,
}

function numberParam(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isInteger(n) ? n : fallback
}

function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={String(value)} />
}

export default async function CensusPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const tableParams = readTableParams(await searchParams)
  const yearParam = firstParam(tableParams, 'year')
  const monthParam = firstParam(tableParams, 'month')
  const largeSort = scopedSort(CENSUS_PATH, tableParams, LARGE_PERMIT_SORT, LARGE_SCOPE)
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const year = numberParam(yearParam, Number(today.slice(0, 4)))
  const month = monthParam === 'year' ? null : numberParam(monthParam, Number(today.slice(5, 7)))
  const report = await censusBpsReport(ctx.db, ctx.actor, { year, month }, ctx.signal)
  if (!report.ok) return <NoPermission title="Census report" action="see the Census report" />
  const r = report.value
  const csvHref = `/staff/reports/census/csv?year=${year}&month=${month ?? 'year'}`
  const suggestions = await Promise.all(
    r.needsClassification.map(async (row) => {
      const context = await loadApplicationContext(ctx.db, row.applicationId, ctx.signal)
      const suggestion =
        context === null
          ? null
          : suggestCensus(
              {
                workType:
                  typeof context.values.work_type === 'string' ? context.values.work_type : null,
                classification: context.facts.classification,
                dwellingUnits: context.facts.dwellingUnits,
              },
              context.values,
            )
      return { row, suggestion: suggestion ?? EMPTY, suggested: suggestion !== null }
    }),
  )
  return (
    <main className="space-y-6">
      <h1>Census building permits report</h1>
      <p className="m-0">
        Counts of new housing units from permits issued, in the categories of Census Bureau Form
        C-404. Key these numbers into the Census site.
      </p>
      <form method="get" className="flex flex-wrap items-end gap-4">
        <TextField
          label="Year"
          name="year"
          type="number"
          defaultValue={year}
          min="2000"
          max="2100"
          required
        />
        <SelectField
          label="Period"
          name="month"
          defaultValue={month === null ? 'year' : String(month)}
          options={[
            ['year', 'Whole year'],
            ...MONTHS.map((m, i) => [String(i + 1), m] as [string, string]),
          ]}
        />
        {activeSortFields(tableParams, [LARGE_SCOPE]).map(([name, value]) => (
          <Hidden key={name} name={name} value={value} />
        ))}
        <button type="submit" className="rounded-md border px-4 py-2 text-sm">
          Show report
        </button>
      </form>
      <h2>{`${r.townName}, ${r.period}`}</h2>
      {r.noPermits ? <p role="status">No permits issued.</p> : null}
      {r.complete ? null : (
        <p role="alert">
          {`${incompleteCopy(r)} below. The spreadsheet file is available once every permit is classified.`}
        </p>
      )}
      <section aria-labelledby="section-3" className="space-y-2">
        <h2 id="section-3">Section 3: Housing units authorized</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Type of structure</th>
              <th scope="col">Buildings</th>
              <th scope="col">Housing units</th>
              <th scope="col">Valuation in dollars</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((i) => (
              <tr key={i.code}>
                <td>{i.code}</td>
                <td>{i.label}</td>
                <td>{i.buildings}</td>
                <td>{i.housingUnits}</td>
                <td>{i.valuationDollars.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-labelledby="section-4" className="space-y-2">
        <h2 id="section-4">Section 4: Permits valued at $1,000,000 or more</h2>
        {r.largePermits.length === 0 ? (
          <p>No permit this period is valued at $1,000,000 or more.</p>
        ) : (
          <div className="table-panel">
            <table className="w-full min-w-[44rem] text-left">
              <thead>
                <tr>
                  <SortHeader label="Permit" link={largeSort.links.permit} />
                  <SortHeader label="Description" link={largeSort.links.description} />
                  <SortHeader label="Site address" link={largeSort.links.address} />
                  <SortHeader label="Owner or builder" link={largeSort.links.owner} />
                  <SortHeader label="Buildings" link={largeSort.links.buildings} />
                  <SortHeader label="Housing units" link={largeSort.links.units} />
                  <SortHeader label="Valuation in dollars" link={largeSort.links.valuation} />
                </tr>
              </thead>
              <tbody>
                {sortLargePermits(r.largePermits, largeSort.state).map((p) => (
                  <tr key={p.number}>
                    <td>{p.number}</td>
                    <td>{p.description}</td>
                    <td>{p.siteAddress}</td>
                    <td>{p.ownerOrBuilder}</td>
                    <td>{p.buildings}</td>
                    <td>{p.housingUnits}</td>
                    <td>{p.valuationDollars.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {r.complete ? (
        <Link href={csvHref} className="inline-block text-action underline">
          Download as a spreadsheet file
        </Link>
      ) : null}
      {suggestions.length === 0 ? null : (
        <section aria-labelledby="needs" className="space-y-3 border-t pt-4">
          <h2 id="needs">Needs classification</h2>
          <p className="m-0">
            Chiban cannot tell a new building from an addition, so confirm each permit before it
            counts.
          </p>
          <ul className="m-0 list-none space-y-4 p-0">
            {suggestions.map(({ row, suggestion, suggested }) => (
              <li key={row.applicationId} className="rounded-md border p-3">
                <p className="m-0 font-medium">{`Permit ${row.number}`}</p>
                <p className="m-0">
                  {suggested
                    ? 'Suggested from the application.'
                    : 'No suggestion: enter the counts.'}
                </p>
                <ActionForm action={classifyCensusAction} submitLabel="Save classification">
                  <Hidden name="applicationId" value={row.applicationId} />
                  <SelectField
                    label="Kind of structure"
                    name="category"
                    defaultValue={suggestion.category}
                    options={Object.entries<string>(CENSUS_CATEGORY_LABELS)}
                  />
                  <SelectField
                    label="If left out of the count, why"
                    name="excludedReason"
                    defaultValue={suggestion.excludedReason ?? ''}
                    options={[
                      ['', 'Not left out'],
                      ...CENSUS_EXCLUDED_REASONS.map(
                        (x) => [x, CENSUS_REASON_LABELS[x]] as [string, string],
                      ),
                    ]}
                  />
                  <SelectField
                    label="Phase"
                    name="phase"
                    defaultValue={suggestion.phase}
                    options={Object.entries<string>(CENSUS_PHASE_LABELS)}
                  />
                  <TextField
                    label="Buildings"
                    name="buildings"
                    type="number"
                    min="0"
                    defaultValue={suggestion.buildings}
                    required
                  />
                  <TextField
                    label="Housing units"
                    name="housingUnits"
                    type="number"
                    min="0"
                    defaultValue={suggestion.housingUnits}
                    required
                  />
                  <TextField
                    label="Valuation in whole dollars"
                    name="valuationDollars"
                    type="number"
                    min="0"
                    defaultValue={suggestion.valuationDollars}
                    required
                  />
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
