import { serverApiClient } from '@/lib/api'
import { ApiError } from '@waveger/api-client'
import type { ApiStatus } from '@waveger/domain'

export default async function Home() {
  const client = await serverApiClient()

  let status: ApiStatus | null = null
  let failure: string | null = null
  try {
    status = await client.getStatus()
  } catch (error) {
    failure =
      error instanceof ApiError
        ? `${error.code}: ${error.message}`
        : String(error)
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Waveger</h1>
        <p className="text-sm text-zinc-500">
          Fetched from <code className="font-mono">/api/v1/status</code> through
          the shared client.
        </p>
      </header>

      {failure !== null ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {failure}
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-zinc-500">Service</dt>
          <dd className="font-mono">
            {status?.service} {status?.version}
          </dd>

          <dt className="text-zinc-500">Database</dt>
          <dd className="font-mono">
            reachable, {status?.database.migrations.length} migration
            {status?.database.migrations.length === 1 ? '' : 's'} applied
          </dd>

          <dt className="text-zinc-500">Charts</dt>
          <dd>
            <ul className="flex flex-col gap-1">
              {status?.charts.map((chart) => (
                <li key={chart.slug}>
                  {chart.name}{' '}
                  <span className="text-zinc-500">— {chart.compiler}</span>
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      )}
    </main>
  )
}
