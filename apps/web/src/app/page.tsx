import { serverApiClient } from '@/lib/api'
import { describeError } from '@waveger/api-client'
import { publishedDate, type ChartWeek } from '@waveger/domain'

/**
 * The thing a visitor comes to Waveger for: this week's chart, from Position 1
 * down. Written for the web and again for native, on purpose (ADR 0001).
 *
 * Movement and artwork are not here yet — WAV-10 and WAV-12. Until then an
 * Entry states its Position, its Song, its Artist, and the Chart Compiler's own
 * peak and weeks-on-Chart figures, which are what tell a new arrival from a
 * long-running fixture.
 */
type State =
  | { kind: 'held'; week: ChartWeek }
  | { kind: 'empty' }
  | { kind: 'failed'; message: string }

async function loadChartWeek(): Promise<State> {
  const client = await serverApiClient()
  try {
    const week = await client.getLatestChartWeek()
    return week === null ? { kind: 'empty' } : { kind: 'held', week }
  } catch (error) {
    return { kind: 'failed', message: describeError(error) }
  }
}

export default async function Home() {
  const state = await loadChartWeek()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Waveger</h1>
        <p className="text-sm text-zinc-500">
          {state.kind === 'held'
            ? `${state.week.chart.name}, ${publishedDate(state.week.date)}`
            : 'The UK Official Singles Chart.'}
        </p>
      </header>

      {state.kind === 'failed' && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {state.message}
        </p>
      )}

      {state.kind === 'empty' && (
        <p className="rounded-md border border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800">
          No Chart Week yet. Waveger shows a Chart Week once it has ingested
          one.
        </p>
      )}

      {state.kind === 'held' && (
        <ol className="flex flex-col">
          {state.week.entries.map((entry) => (
            <li
              key={entry.position}
              className="flex items-baseline gap-4 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-900"
            >
              <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums text-zinc-500">
                {entry.position}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{entry.title}</span>
                <span className="truncate text-sm text-zinc-500">
                  {entry.artist}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-zinc-500 tabular-nums">
                Peak {entry.peakPosition}
                <br />
                {entry.weeksOnChart} {entry.weeksOnChart === 1 ? 'wk' : 'wks'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
