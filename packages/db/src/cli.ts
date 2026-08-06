import { unpooledConnectionString } from './env'
import { migrateToLatest } from './migrations'

const ran = await migrateToLatest({
  connectionString: unpooledConnectionString(),
  log: (message) => console.log(message),
})

console.log(
  ran.length === 0 ? 'already up to date' : `applied ${ran.length} migration(s)`,
)
