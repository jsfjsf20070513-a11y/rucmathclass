import { statSync } from 'node:fs'
import { checkArticle, readBatch, readJson, readSeeds } from './files.mjs'

try {
  const paths = process.argv.slice(2)
  let count = paths.length ? 0 : readSeeds().length
  for (const path of paths) {
    if (statSync(path).isDirectory()) {
      count += readBatch(path).length
    } else {
      checkArticle(readJson(path))
      count++
    }
  }
  console.log(`${count} 篇全部通过。`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
