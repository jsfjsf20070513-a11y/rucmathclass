// Pure exercise-generation + grading core for the multi-format vocabulary
// trainer. Generation depends on vocabulary data, not on page markup.
//
// The SRS scheduler (srsScheduler.js) decides WHICH words are due; this module
// turns a due word into one of several exercise formats and grades a response.
// Everything here is pure (no React, no Date.now, no audio) so it is unit
// tested directly. Randomness is injected via an `rng` callback (default
// Math.random) so tests can pin shuffles.
//
// Formats (mirror the prototype):
//   recognition — show French, pick the Chinese gloss        (multiple choice)
//   cloze       — example with the headword blanked, pick it (multiple choice)
//   listen      — hear the French, pick it                   (multiple choice + audio)
//   spelling    — show Chinese, type the French              (free input, lenient)
//   build       — reorder word tiles into the example sentence
//   match       — pair N French ↔ N Chinese

export const EXERCISE_TYPES = {
  recognition: 'recognition',
  cloze: 'cloze',
  listen: 'listen',
  spelling: 'spelling',
  build: 'build',
  match: 'match',
}

// Multiple-choice formats share option/answer shape and grading.
const CHOICE_TYPES = new Set([
  EXERCISE_TYPES.recognition,
  EXERCISE_TYPES.cloze,
  EXERCISE_TYPES.listen,
])

const ARTICLE_RE = /^(l['’]|le |la |les |un |une |des |d['’])/

/**
 * Normalize a typed French answer for lenient comparison: lowercase, strip
 * accents, drop a leading article, keep letters only. So "L'élève" and "eleve"
 * compare equal — accents/articles/case never block a learner who knows the
 * word. The UI still shows the correctly-accented form in feedback.
 */
export function normalizeSpelling(value) {
  return `${value ?? ''}`
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(ARTICLE_RE, '')
    .replace(/[^a-z]/g, '')
}

/**
 * Split a sentence into word tokens (strip guillemets, collapse spaces).
 */
export function tokenize(sentence) {
  return `${sentence ?? ''}`
    .replace(/[«»]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Derive a cloze from a word's example sentence by blanking the headword.
 * Returns { sentence, word, tokens } or null when the example doesn't contain
 * the headword (that word simply can't host cloze/build exercises).
 */
export function deriveCloze(word) {
  const example = `${word?.example ?? ''}`.replace(/[«»]/g, '').trim()
  const head = `${word?.french ?? ''}`.trim()
  if (!example || !head) return null
  // Match the headword as a whole word, case-insensitive.
  const re = new RegExp(`(^|\\s)(${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\s|$|[.,;!?])`, 'i')
  if (!re.test(example)) return null
  const sentence = example.replace(re, (m, pre, _w, post) => `${pre}▁${post}`)
  return { sentence, word: head, tokens: tokenize(example) }
}

function shuffle(arr, rng = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Pick `n` distractor values, excluding the answer, preferring entries that
 * share the answer's part-of-speech and have a similar length. `candidates` is an array of word objects;
 * `field` selects which string to pull (chinese / french / clozeWord-ish).
 */
export function pickDistractors(candidates, { answer, answerPos, n = 3, field = 'chinese', rng = Math.random } = {}) {
  const pool = candidates
    .map((w) => ({ value: `${w?.[field] ?? ''}`.trim(), pos: w?.pos }))
    .filter((c) => c.value && c.value !== answer)
  // dedupe by value
  const seen = new Set()
  const unique = pool.filter((c) => (seen.has(c.value) ? false : seen.add(c.value)))

  const samePos = shuffle(unique.filter((c) => answerPos && c.pos === answerPos), rng)
  const otherPos = shuffle(unique.filter((c) => !answerPos || c.pos !== answerPos), rng)

  // Within the preferred same-pos group, order by closeness in length so the
  // distractors look plausible; fall back to other-pos words to fill `n`.
  if (answer) {
    const len = `${answer}`.length
    samePos.sort((a, b) => Math.abs(a.value.length - len) - Math.abs(b.value.length - len))
  }
  return [...samePos, ...otherPos].slice(0, n).map((c) => c.value)
}

/**
 * Which exercise formats a word can host given its data. spelling/listen/
 * recognition need french+chinese; cloze/build additionally need a derivable
 * example.
 */
export function supportedTypes(word) {
  const base = []
  if (word?.french && word?.chinese) {
    base.push(EXERCISE_TYPES.recognition, EXERCISE_TYPES.listen, EXERCISE_TYPES.spelling)
  }
  if (deriveCloze(word)) {
    base.push(EXERCISE_TYPES.cloze, EXERCISE_TYPES.build)
  }
  return base
}

/**
 * Build a single exercise for `word`, drawing distractors from `deck`. If the
 * requested `type` isn't supported by the word, falls back to recognition.
 * Returns a plain object the UI renders; `answer` is what gradeExercise checks.
 */
export function findAmbiguousSpellingPrompts(deck) {
  const answers = new Map()
  for (const word of deck) {
    const prompt = `${word.chinese}`.trim()
    if (!answers.has(prompt)) answers.set(prompt, new Set())
    answers.get(prompt).add(normalizeSpelling(word.french))
  }
  return new Set([...answers].filter(([, words]) => words.size > 1).map(([prompt]) => prompt))
}

export function buildExercise(word, deck = [], { type, rng = Math.random, ambiguousSpellingPrompts } = {}) {
  const supported = supportedTypes(word)
  let chosen = supported.includes(type) ? type : (supported[0] || EXERCISE_TYPES.recognition)
  const others = deck.filter((w) => w?.id !== word?.id)
  // A Chinese-only cue cannot distinguish two headwords with the same gloss.
  // Test recognition of this word instead of falsely marking a synonym wrong.
  if (chosen === EXERCISE_TYPES.spelling
    && (ambiguousSpellingPrompts || findAmbiguousSpellingPrompts(deck)).has(`${word.chinese}`.trim())) {
    chosen = EXERCISE_TYPES.recognition
  }

  if (chosen === EXERCISE_TYPES.recognition) {
    const answer = `${word.chinese}`.trim()
    const distractors = pickDistractors(others, { answer, answerPos: word.pos, field: 'chinese', rng })
    return { type: chosen, word, prompt: word.french, options: shuffle([answer, ...distractors], rng), answer }
  }
  if (chosen === EXERCISE_TYPES.listen) {
    const answer = `${word.french}`.trim()
    const distractors = pickDistractors(others, { answer, answerPos: word.pos, field: 'french', rng })
    return { type: chosen, word, audioText: answer, options: shuffle([answer, ...distractors], rng), answer }
  }
  if (chosen === EXERCISE_TYPES.spelling) {
    return { type: chosen, word, prompt: word.chinese, answer: `${word.french}`.trim() }
  }
  if (chosen === EXERCISE_TYPES.cloze) {
    const cloze = deriveCloze(word)
    const answer = cloze.word
    const distractors = pickDistractors(others, { answer, answerPos: word.pos, field: 'french', rng })
    return { type: chosen, word, sentence: cloze.sentence, options: shuffle([answer, ...distractors], rng), answer }
  }
  if (chosen === EXERCISE_TYPES.build) {
    const cloze = deriveCloze(word)
    const tiles = cloze.tokens.map((w, i) => ({ id: `t${i}`, w }))
    // distractor tiles: tokens from other words' examples not already present
    const otherTokens = others
      .map((w) => deriveCloze(w))
      .filter(Boolean)
      .flatMap((c) => c.tokens)
      .filter((t) => !cloze.tokens.includes(t))
    const distractorTiles = shuffle(otherTokens, rng).slice(0, 2).map((w, i) => ({ id: `d${i}`, w }))
    return {
      type: chosen,
      word,
      bank: shuffle([...tiles, ...distractorTiles], rng),
      answer: cloze.tokens.join(' '),
    }
  }
  // match handled at session level (needs N cards); fall back to recognition.
  const answer = `${word.chinese}`.trim()
  return { type: EXERCISE_TYPES.recognition, word, prompt: word.french, options: shuffle([answer], rng), answer }
}

/**
 * Build a match exercise from N words (default 4): pair French ↔ Chinese.
 */
export function buildMatchExercise(words, { rng = Math.random } = {}) {
  const cards = words.map((w) => ({ id: w.id, french: w.french, chinese: w.chinese }))
  return {
    type: EXERCISE_TYPES.match,
    cards,
    left: shuffle(cards.map((c) => ({ id: c.id, text: c.french })), rng),
    right: shuffle(cards.map((c) => ({ id: c.id, text: c.chinese })), rng),
  }
}

/**
 * Grade a response against an exercise. Returns a boolean.
 *   choice types — response is the picked option string
 *   spelling     — response is the typed string (lenient normalize)
 *   build        — response is an array of tile word strings (in order)
 *   match        — response is the count of correctly matched pairs (or true)
 */
export function gradeExercise(exercise, response) {
  if (!exercise) return false
  if (CHOICE_TYPES.has(exercise.type)) {
    return response === exercise.answer
  }
  if (exercise.type === EXERCISE_TYPES.spelling) {
    return normalizeSpelling(response) !== '' && normalizeSpelling(response) === normalizeSpelling(exercise.answer)
  }
  if (exercise.type === EXERCISE_TYPES.build) {
    const got = Array.isArray(response) ? response.join(' ') : `${response ?? ''}`
    return got === exercise.answer
  }
  if (exercise.type === EXERCISE_TYPES.match) {
    return response === true || response === exercise.cards?.length
  }
  return false
}
