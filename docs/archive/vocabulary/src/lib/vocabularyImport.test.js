import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  csvToObjects,
  importVocabulary,
  toDataModuleSource,
} from './vocabularyImport'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    const text = 'french,example\nchat,"un chat, noir"\nmot,"il dit ""bonjour"""'
    expect(parseCsv(text)).toEqual([
      ['french', 'example'],
      ['chat', 'un chat, noir'],
      ['mot', 'il dit "bonjour"'],
    ])
  })

  it('handles newlines inside quotes', () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([['a'], ['line1\nline2']])
  })

  it('tolerates trailing newline and CRLF', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('csvToObjects', () => {
  it('keys data rows by header and trims', () => {
    const objs = csvToObjects(' french , chinese \n chat , 猫 ')
    expect(objs).toEqual([{ french: 'chat', chinese: '猫' }])
  })

  it('skips blank lines and returns [] when only a header', () => {
    expect(csvToObjects('french,chinese\n\nchat,猫\n')).toEqual([{ french: 'chat', chinese: '猫' }])
    expect(csvToObjects('french,chinese')).toEqual([])
  })
})

describe('importVocabulary — CSV', () => {
  const csv = [
    'french,chinese,pos,gender,conjugation',
    'chat,猫,noun,m,',
    'livre,书,noun,,', // rejected: noun without gender
    'parler,说,verb,,je parle',
    'parler,说,verb,,je parle', // duplicate id
  ].join('\n')

  it('accepts valid rows, reports rejects and duplicates', () => {
    const { words, report } = importVocabulary(csv, { format: 'csv' })
    expect(words.map((w) => w.french)).toEqual(['chat', 'parler'])
    expect(report.total).toBe(4)
    expect(report.accepted).toBe(2)
    expect(report.rejected).toHaveLength(1)
    expect(report.rejected[0].french).toBe('livre')
    expect(report.duplicates).toHaveLength(1)
  })

  it('derives a stable accent-stripped id from the french headword', () => {
    const { words } = importVocabulary('french,chinese,pos,gender\ndérivée,导数,noun,f', { format: 'csv' })
    expect(words[0].id).toBe('fr-derivee')
  })

  it('keeps an explicit id when provided', () => {
    const { words } = importVocabulary('id,french,chinese,pos,gender\nx1,chat,猫,noun,m', { format: 'csv' })
    expect(words[0].id).toBe('x1')
  })
})

describe('importVocabulary — JSON + autodetect', () => {
  it('parses a JSON array', () => {
    const json = JSON.stringify([
      { french: 'chat', chinese: '猫', pos: 'noun', gender: 'm' },
      { french: 'parler', chinese: '说', pos: 'verb', conjugation: 'je parle' },
    ])
    const { words, report } = importVocabulary(json)
    expect(report.accepted).toBe(2)
    expect(words[0].id).toBe('fr-chat')
  })

  it('autodetects JSON vs CSV from the leading character', () => {
    const { report } = importVocabulary('{"french":"chat","chinese":"猫","pos":"noun","gender":"m"}')
    expect(report.accepted).toBe(1)
  })
})

describe('toDataModuleSource', () => {
  it('emits a re-importable module that round-trips', () => {
    const words = [{ id: 'fr-chat', french: 'chat', chinese: '猫', pos: 'noun', gender: 'm' }]
    const src = toDataModuleSource(words)
    expect(src).toContain('export const frenchVocabulary = [')
    expect(src).toContain('export default frenchVocabulary')
    expect(src).toContain('"id":"fr-chat"')
  })
})
