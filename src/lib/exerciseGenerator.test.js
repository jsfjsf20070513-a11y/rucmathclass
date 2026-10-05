import { describe, it, expect } from 'vitest'
import {
  EXERCISE_TYPES,
  normalizeSpelling,
  tokenize,
  deriveCloze,
  pickDistractors,
  supportedTypes,
  buildExercise,
  buildMatchExercise,
  gradeExercise,
} from './exerciseGenerator'
import { frenchVocabulary } from '../data/frenchVocabulary'

const R0 = () => 0 // deterministic rng for reproducible shuffles

const DECK = [
  { id: 'fr-nombre', french: 'nombre', chinese: '数', pos: 'noun', example: 'un nombre premier' },
  { id: 'fr-fonction', french: 'fonction', chinese: '函数', pos: 'noun', example: 'une fonction continue' },
  { id: 'fr-livre', french: 'livre', chinese: '书', pos: 'noun', example: 'un livre de maths' },
  { id: 'fr-parler', french: 'parler', chinese: '说', pos: 'verb', example: 'parler français' },
]

describe('normalizeSpelling', () => {
  it('is case / accent / article insensitive', () => {
    expect(normalizeSpelling('Café')).toBe('cafe')
    expect(normalizeSpelling('café')).toBe(normalizeSpelling('cafe'))
    expect(normalizeSpelling("L'élève")).toBe('eleve')
    expect(normalizeSpelling('le nombre')).toBe('nombre')
    expect(normalizeSpelling('  PARLER ')).toBe('parler')
  })
  it('returns empty for blank', () => {
    expect(normalizeSpelling('')).toBe('')
    expect(normalizeSpelling(null)).toBe('')
  })
})

describe('tokenize', () => {
  it('splits words and strips guillemets', () => {
    expect(tokenize('« un nombre premier »')).toEqual(['un', 'nombre', 'premier'])
  })
})

describe('deriveCloze', () => {
  it('blanks the headword in the example', () => {
    const c = deriveCloze(DECK[0])
    expect(c.word).toBe('nombre')
    expect(c.sentence).toContain('▁')
    expect(c.sentence).not.toMatch(/\bnombre\b/)
    expect(c.tokens).toEqual(['un', 'nombre', 'premier'])
  })
  it('returns null when the example lacks the headword', () => {
    expect(deriveCloze({ french: 'chat', example: 'un chien noir' })).toBeNull()
    expect(deriveCloze({ french: 'chat' })).toBeNull()
  })
})

describe('pickDistractors', () => {
  it('excludes the answer, dedupes, and returns n', () => {
    const d = pickDistractors(DECK, { answer: '数', answerPos: 'noun', n: 2, field: 'chinese', rng: R0 })
    expect(d).toHaveLength(2)
    expect(d).not.toContain('数')
  })
  it('prefers same part-of-speech', () => {
    // answer is a noun → distractors should be drawn from the noun glosses first
    const nounGlosses = new Set(['函数', '书'])
    const d = pickDistractors(DECK, { answer: '数', answerPos: 'noun', n: 2, field: 'chinese', rng: R0 })
    expect(d.every((g) => nounGlosses.has(g))).toBe(true)
  })
})

describe('supportedTypes', () => {
  it('offers cloze/build only when an example yields a cloze', () => {
    expect(supportedTypes(DECK[0])).toEqual(
      expect.arrayContaining([EXERCISE_TYPES.recognition, EXERCISE_TYPES.spelling, EXERCISE_TYPES.cloze, EXERCISE_TYPES.build]),
    )
    expect(supportedTypes({ french: 'x', chinese: 'y', pos: 'noun' })).toEqual(
      expect.arrayContaining([EXERCISE_TYPES.recognition, EXERCISE_TYPES.spelling]),
    )
    expect(supportedTypes({ french: 'x', chinese: 'y' })).not.toContain(EXERCISE_TYPES.cloze)
  })
})

describe('buildExercise', () => {
  it('does not ask an ambiguous Chinese-only spelling question for real synonyms', () => {
    const word = frenchVocabulary.find((entry) => entry.french === 'quoique')
    const other = frenchVocabulary.find((entry) => entry.french === 'bien que')
    expect(word.chinese).toBe(other.chinese)
    const exercise = buildExercise(word, frenchVocabulary, { type: 'spelling', rng: R0 })
    expect(exercise.type).toBe('recognition')
    expect(gradeExercise(exercise, word.chinese)).toBe(true)
  })
  it('recognition: french prompt, options contain the chinese answer + distractors', () => {
    const ex = buildExercise(DECK[0], DECK, { type: 'recognition', rng: R0 })
    expect(ex.type).toBe('recognition')
    expect(ex.prompt).toBe('nombre')
    expect(ex.answer).toBe('数')
    expect(ex.options).toContain('数')
    expect(ex.options.length).toBeGreaterThanOrEqual(2)
    expect(new Set(ex.options).size).toBe(ex.options.length) // no dup options
  })
  it('spelling: chinese prompt, french answer', () => {
    const ex = buildExercise(DECK[0], DECK, { type: 'spelling', rng: R0 })
    expect(ex).toMatchObject({ type: 'spelling', prompt: '数', answer: 'nombre' })
  })
  it('listen: carries audioText and options including the french answer', () => {
    const ex = buildExercise(DECK[0], DECK, { type: 'listen', rng: R0 })
    expect(ex.audioText).toBe('nombre')
    expect(ex.options).toContain('nombre')
  })
  it('cloze: blanked sentence + options including the headword', () => {
    const ex = buildExercise(DECK[0], DECK, { type: 'cloze', rng: R0 })
    expect(ex.sentence).toContain('▁')
    expect(ex.answer).toBe('nombre')
    expect(ex.options).toContain('nombre')
  })
  it('build: bank contains every answer token, answer is the joined sentence', () => {
    const ex = buildExercise(DECK[0], DECK, { type: 'build', rng: R0 })
    expect(ex.answer).toBe('un nombre premier')
    const bankWords = ex.bank.map((t) => t.w)
    for (const tok of ['un', 'nombre', 'premier']) expect(bankWords).toContain(tok)
    expect(ex.bank.length).toBeGreaterThanOrEqual(3)
  })
  it('falls back to recognition for an unsupported requested type', () => {
    const ex = buildExercise({ french: 'x', chinese: 'y', pos: 'noun' }, DECK, { type: 'build', rng: R0 })
    expect(ex.type).toBe('recognition')
  })
})

describe('buildMatchExercise', () => {
  it('真实同义词和同形词不会生成无法区分的选项', () => {
    const words = ['cependant', 'toutefois', 'pouvoir', 'bonjour', 'voyage', 'voyager']
      .flatMap((french) => frenchVocabulary.filter((word) => word.french === french))
    const exercise = buildMatchExercise(words, { rng: R0 })
    expect(exercise.cards).toHaveLength(4)
    for (const side of [exercise.left, exercise.right]) expect(new Set(side.map(({ text }) => text.trim().toLowerCase())).size).toBe(side.length)
  })
  it('pairs french ↔ chinese across the given words', () => {
    const ex = buildMatchExercise(DECK.slice(0, 3), { rng: R0 })
    expect(ex.type).toBe('match')
    expect(ex.cards).toHaveLength(3)
    expect(ex.left.map((l) => l.text).sort()).toEqual(['fonction', 'livre', 'nombre'])
    expect(ex.right.map((r) => r.text).sort()).toEqual(['书', '函数', '数'])
  })
})

describe('gradeExercise', () => {
  it('grades choice types by exact option', () => {
    const ex = { type: 'recognition', answer: '数' }
    expect(gradeExercise(ex, '数')).toBe(true)
    expect(gradeExercise(ex, '书')).toBe(false)
  })
  it('grades spelling leniently (accents/case/articles)', () => {
    const ex = { type: 'spelling', answer: 'élève' }
    expect(gradeExercise(ex, 'eleve')).toBe(true)
    expect(gradeExercise(ex, 'ÉLÈVE')).toBe(true)
    expect(gradeExercise(ex, '')).toBe(false)
    expect(gradeExercise(ex, 'autre')).toBe(false)
  })
  it('grades build by token order', () => {
    const ex = { type: 'build', answer: 'un nombre premier' }
    expect(gradeExercise(ex, ['un', 'nombre', 'premier'])).toBe(true)
    expect(gradeExercise(ex, ['nombre', 'un', 'premier'])).toBe(false)
  })
  it('grades match by completed pair count', () => {
    const ex = { type: 'match', cards: [{}, {}, {}] }
    expect(gradeExercise(ex, 3)).toBe(true)
    expect(gradeExercise(ex, true)).toBe(true)
    expect(gradeExercise(ex, 2)).toBe(false)
  })
})
