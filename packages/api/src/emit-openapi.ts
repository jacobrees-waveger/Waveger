import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createOpenApiDocument } from './app'

/**
 * Writes `packages/api/openapi.json` from the live route definitions.
 *
 * The document is committed so that a change to the contract shows up as a
 * diff in review rather than only at runtime. A test asserts the committed
 * file still matches what the routes generate.
 */
const target = fileURLToPath(new URL('../openapi.json', import.meta.url))

await writeFile(target, `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`)

console.log(`wrote ${target}`)
