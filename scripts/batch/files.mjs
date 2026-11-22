import { randomUUID } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { generate } from './codex.mjs'

export function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { throw new Error(`${path}：${error.message}`) }
}

// 临时文件写完才挂到正式文件名。两个进程同时续跑时都读取先保存的那一份。
export function saveNew(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = join(dirname(path), `.${randomUUID()}.tmp`)
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2) + '\n')
    try { linkSync(temp, path) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
  } finally { if (existsSync(temp)) unlinkSync(temp) }
  return readJson(path)
}

export async function modelFile(path, model, schema, prompt, check, label) {
  const value = existsSync(path) ? readJson(path) : saveNew(path, await generate(model, schema, prompt, check, label))
  check(value)
  return value
}
