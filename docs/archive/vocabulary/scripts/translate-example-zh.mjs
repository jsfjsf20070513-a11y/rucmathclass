#!/usr/bin/env node
// 给词库源(scripts/vocab-source.json)的法语例句补中文翻译(exampleZh)。
//
// 用法:
//   node scripts/translate-example-zh.mjs [--limit <批数>] [--dry]
//
// 设计:
// - 只处理「有 example 且无 exampleZh」的词条,跑一批写盘一批,可随时中断续跑;
// - 走本站自己的 Cloudflare Worker(/api/chat → Gemini),尊重其 30 次/60s 限流;
// - 输出要求严格 JSON,逐条校验 id 对应与中文非空;解析失败整批跳过并记录,
//   绝不把半坏数据写进词库源。
// - 排序:数学/逻辑标签优先,其后按 CEFR 等级 A1→C2(先服务最常被抽到的新词)。

import { readFile, writeFile } from 'node:fs/promises'
import { argv, exit } from 'node:process'

const SOURCE = new URL('./vocab-source.json', import.meta.url)
const ENDPOINT = 'https://rucmathclass.com/api/chat'
const BATCH_SIZE = 35
const PAUSE_MS = 4500
const LEVEL_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 }
const PRIORITY_TAGS = new Set(['math', 'mathématiques', 'logique'])

function parseArgs(args) {
  let limit = Infinity
  let dry = false
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--limit') {
      limit = Number(args[i + 1])
      i += 1
    } else if (args[i] === '--dry') {
      dry = true
    }
  }
  return { limit, dry }
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

function buildPrompt(batch) {
  const lines = batch.map((w, i) => JSON.stringify({ n: i + 1, fr: w.example }))
  return [
    '任务:把下列法语例句逐条译成中文。',
    '要求:译文信达雅、口吻自然,是中国学生读得顺的一句话;不加引号、不加解释、不留法语原词(专有名词除外)。',
    '输出:严格的 JSON 数组,每项形如 {"n":1,"zh":"..."},n 与输入一致、一条不落;除 JSON 外不得输出任何其它文字。',
    '输入:',
    ...lines,
  ].join('\n')
}

function extractJson(text) {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) throw new Error('回复中找不到 JSON 数组')
  return JSON.parse(text.slice(start, end + 1))
}

const HAS_CJK = /[一-鿿]/

async function translateBatch(batch, attempt = 1) {
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: buildPrompt(batch) }] }),
    })
  } catch (err) {
    // 网络层失败(连接被边缘保护掐断等):指数退避后重试,最多 3 次。
    if (attempt > 3) throw new Error(`网络失败(${err.message},重试后仍失败)`)
    const wait = attempt * 90000
    console.log(`  网络失败,等待 ${wait / 1000}s 重试(第 ${attempt} 次)…`)
    await sleep(wait)
    return translateBatch(batch, attempt + 1)
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 2) throw new Error(`HTTP ${res.status}(重试后仍失败)`)
    console.log(`  HTTP ${res.status},等待 65s 重试…`)
    await sleep(65000)
    return translateBatch(batch, attempt + 1)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { text } = await res.json()
  const items = extractJson(`${text}`)
  const byN = new Map(items.map((it) => [Number(it?.n), `${it?.zh ?? ''}`.trim()]))
  const results = []
  for (let i = 0; i < batch.length; i += 1) {
    const zh = byN.get(i + 1)
    if (!zh || !HAS_CJK.test(zh)) throw new Error(`第 ${i + 1} 条(${batch[i].french})译文缺失或非中文`)
    results.push(zh)
  }
  return results
}

const { limit, dry } = parseArgs(argv.slice(2))
const words = JSON.parse(await readFile(SOURCE, 'utf8'))
if (!Array.isArray(words)) {
  console.error('vocab-source.json 顶层应为数组')
  exit(1)
}

const pending = words
  .filter((w) => w.example && !w.exampleZh)
  .sort((a, b) => {
    const pa = PRIORITY_TAGS.has(a.tag) ? -1 : (LEVEL_ORDER[a.level] ?? 9)
    const pb = PRIORITY_TAGS.has(b.tag) ? -1 : (LEVEL_ORDER[b.level] ?? 9)
    return pa - pb
  })

console.log(`待译 ${pending.length} 条;本次最多 ${Number.isFinite(limit) ? limit : '全部'} 批 × ${BATCH_SIZE}`)
if (dry) {
  console.log('dry run,前 5 条:', pending.slice(0, 5).map((w) => `${w.id} ${w.example}`))
  exit(0)
}

let done = 0
let failedBatches = 0
for (let b = 0; b * BATCH_SIZE < pending.length && b < limit; b += 1) {
  const batch = pending.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
  try {
    const results = await translateBatch(batch)
    results.forEach((zh, i) => {
      batch[i].exampleZh = zh // batch 元素即 words 内对象引用,直接写回
    })
    done += results.length
    await writeFile(SOURCE, `${JSON.stringify(words, null, 2)}\n`)
    console.log(`批 ${b + 1}:+${results.length}(累计 ${done})`)
  } catch (err) {
    failedBatches += 1
    console.error(`批 ${b + 1} 失败,整批跳过:${err.message}`)
  }
  await sleep(PAUSE_MS)
}

console.log(`完成:本次写入 ${done} 条;失败批次 ${failedBatches};剩余待译 ${words.filter((w) => w.example && !w.exampleZh).length}`)
