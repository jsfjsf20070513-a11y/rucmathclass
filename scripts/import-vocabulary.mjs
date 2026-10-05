#!/usr/bin/env node
// Batch-import a CSV/JSON word list into the French vocabulary deck.
//
// Usage:
//   node scripts/import-vocabulary.mjs <input.csv|input.json> [--out src/data/frenchVocabulary.js]
//
// Prints a validation report (accepted / rejected-with-reasons / duplicates).
// With --out it writes the validated deck as a frenchVocabulary.js module;
// without --out it is a dry run (report only). Validation reuses the same
// cleanFrenchWord rules the trainer enforces (noun→gender, verb→conjugation).

import { readFile, writeFile, rename, rm, realpath } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, exit } from 'node:process'
import { importVocabulary, toDataModuleSource, assertVocabularyWrite } from '../src/lib/vocabularyImport.js'
import { frenchVocabulary } from '../src/data/frenchVocabulary.js'

function parseArgs(args) {
  const positional = []
  let out = null
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') {
      if (out || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--out 后需要指定一个输出文件。')
      out = args[i + 1]
      i += 1
    } else {
      if (args[i].startsWith('--') || positional.length) throw new Error(`无法识别参数：${args[i]}`)
      positional.push(args[i])
    }
  }
  return { input: positional[0], out }
}

async function main() {
  const { input, out } = parseArgs(argv.slice(2))

  if (!input) {
    console.error('Usage: node scripts/import-vocabulary.mjs <input.csv|input.json> [--out <file>]')
    exit(1)
  }

  const text = await readFile(input, 'utf8')
  const format = input.toLowerCase().endsWith('.json') ? 'json' : input.toLowerCase().endsWith('.csv') ? 'csv' : undefined
  const { words, report } = importVocabulary(text, { format })

  console.log(`\n— 导入报告 (${input}) —`)
  console.log(`  读入   : ${report.total}`)
  console.log(`  ✓ 接受 : ${report.accepted}`)
  console.log(`  ✗ 拒绝 : ${report.rejected.length}`)
  console.log(`  ⊘ 重复 : ${report.duplicates.length}`)

  if (report.rejected.length) {
    console.log('\n  被拒条目:')
    for (const r of report.rejected) {
      console.log(`    [行 ${r.index + 1}] ${r.french || '(无 french)'} — ${r.errors.join('; ')}`)
    }
  }
  if (report.duplicates.length) {
    console.log('\n  重复 id(已跳过):')
    for (const d of report.duplicates) {
      console.log(`    [行 ${d.index + 1}] ${d.id}`)
    }
  }

  try {
    const canonical = fileURLToPath(new URL('../src/data/frenchVocabulary.js', import.meta.url))
    const target = out ? await realpath(resolve(out)).catch(() => resolve(out)) : null
    assertVocabularyWrite({ words, report }, target === canonical ? frenchVocabulary : [])
    if (target) {
      const temporary = `${target}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, toDataModuleSource(words), { encoding: 'utf8', flag: 'wx' })
        await rename(temporary, target)
      } finally { await rm(temporary, { force: true }) }
      console.log(`\n  已写出 ${words.length} 条 → ${out}`)
    } else {
      console.log('\n  检查通过。加 --out <file> 才会写文件。')
    }
  } catch (error) {
    console.error(error.message)
    exit(2)
  }
}

main().catch((error) => {
  console.error(error.message)
  exit(2)
})
