import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertVocabularyWrite, importVocabulary } from '../../src/lib/vocabularyImport.js'

const importer = fileURLToPath(new URL('../import-vocabulary.mjs', import.meta.url))
const word = { id: 'fr-chat', french: 'chat', chinese: '猫', pos: 'noun', gender: 'm' }

describe('词库导入保护', () => {
  it.each([
    [{ french: 'livre', chinese: '书', pos: 'noun' }],
    [word, { french: 'livre', chinese: '书', pos: 'noun' }],
    [word, word],
    [word, { ...word, french: 'livre', id: '   ' }],
  ])('有错误时命令失败，并完整保留已有文件 %#', async (...rows) => {
    const directory = await mkdtemp(join(tmpdir(), 'mathclass-import-'))
    try {
      const input = join(directory, 'input.json'), output = join(directory, 'words.js')
      await writeFile(input, JSON.stringify(rows))
      await writeFile(output, '原有完整词库')
      let failure
      try { execFileSync(process.execPath, [importer, input, '--out', output], { stdio: 'pipe' }) } catch (error) { failure = error }
      expect(failure?.status).toBe(2)
      expect(await readFile(output, 'utf8')).toBe('原有完整词库')
      expect((await readdir(directory)).sort()).toEqual(['input.json', 'words.js'])
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('拒绝丢失或交换旧词 ID，允许保留 ID 后补充内容和新词', () => {
    const previous = [word, { ...word, id: 'fr-livre', french: 'livre' }]
    expect(() => assertVocabularyWrite(importVocabulary(JSON.stringify([word])), previous)).toThrow('丢失')
    expect(() => assertVocabularyWrite(importVocabulary(JSON.stringify(previous.map((row) => ({ ...row, id: row.id === 'fr-chat' ? 'fr-livre' : 'fr-chat' })))), previous)).toThrow('别的 ID')
    expect(() => assertVocabularyWrite(importVocabulary(JSON.stringify([...previous, { ...word, id: 'fr-chien', french: 'chien' }])), previous)).not.toThrow()
  })

  it('CSV 引号未闭合时保留输出文件，并只显示可读的错误', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mathclass-import-'))
    try {
      const input = join(directory, 'input.csv'), output = join(directory, 'words.js')
      await writeFile(input, 'id,french,chinese,pos,gender,example\nfr-chat,chat,猫,noun,m,"le chat')
      await writeFile(output, '原有完整词库')
      let failure
      try { execFileSync(process.execPath, [importer, input, '--out', output], { stdio: 'pipe' }) } catch (error) { failure = error }
      expect(failure?.status).toBe(2)
      expect(failure.stderr.toString().trim()).toBe('CSV 有一处引号没有闭合。原文件未改，请修正后重试。')
      expect(await readFile(output, 'utf8')).toBe('原有完整词库')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
