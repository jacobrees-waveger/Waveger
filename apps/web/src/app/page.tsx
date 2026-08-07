import { serverApiClient } from '@/lib/api'
import { describeError } from '@waveger/api-client'
import { publishedDate, type ChartMovement, type ChartWeek } from '@waveger/domain'

/**
 * The thing a visitor comes to Waveger for: this week's chart, from Position 1
 * down. Written for the web and again for native, on purpose (ADR 0001).
 *
 * The shape of the week, not just a flat list: every Entry says how far it
 * moved, and the Songs that dropped out are named underneath rather than
 * silently missing. Artwork is not here yet — WAV-12.
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
              <Movement movement={entry.movement} />
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

      {state.kind === 'held' && state.week.exits.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Left the chart
          </h2>
          <ul className="flex flex-col">
            {state.week.exits.map((exit) => (
              <li
                key={exit.previousPosition}
                className="flex items-baseline gap-4 border-b border-zinc-100 py-2 text-sm last:border-0 dark:border-zinc-900"
              >
                <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums text-zinc-400 line-through">
                  {exit.previousPosition}
                </span>
                {/* An exit has no movement, but it keeps the column so its
                    Song lines up with the Songs above it. */}
                <span className="w-12 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-zinc-500">{exit.title}</span>
                  <span className="truncate text-xs text-zinc-400">
                    {exit.artist}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

/**
 * How far an Entry moved, in the width of a couple of characters.
 *
 * The four states are shown as four different things rather than as one number
 * with special cases in it. A debut is a word, because a Song arriving is not a
 * move of some size; unknown is blank, because Waveger holding no previous
 * Chart Week is a fact about Waveger and there is nothing to tell a visitor
 * about the Song.
 */
function Movement({ movement }: { movement: ChartMovement }) {
  const shown = describe(movement)

  return (
    <span
      className={`w-12 shrink-0 text-right font-mono text-xs tabular-nums ${shown.tone}`}
    >
      {shown.label}
    </span>
  )
}

function describe(movement: ChartMovement): { label: string; tone: string } {
  switch (movement.kind) {
    case 'moved':
      return movement.positionsGained > 0
        ? {
            label: `▲ ${movement.positionsGained}`,
            tone: 'text-emerald-600 dark:text-emerald-400',
          }
        : {
            label: `▼ ${-movement.positionsGained}`,
            tone: 'text-rose-600 dark:text-rose-400',
          }
    case 'non-mover':
      return { label: '–', tone: 'text-zinc-400' }
    case 'debut':
      return { label: 'New', tone: 'text-sky-600 dark:text-sky-400' }
    case 'unknown':
      return { label: '', tone: 'text-zinc-400' }
  }
}
