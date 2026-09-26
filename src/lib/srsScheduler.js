// Pure SRS (spaced-repetition) core for the bilingual French vocabulary trainer.
//
// Scheduling rules implemented below:
//   - Ebbinghaus FIXED ladder: next_review_at = completion_date + CURVE_DAYS[stage].
//     A correct answer advances one stage; a wrong answer resets to stage 0.
//     Anchoring to the calendar date (not the exact instant) lets a whole day's
//     reviews surface together, which suits daily batch study.
//   - New / review words are interleaved (new, review, new, review, …) so a
//     session never front-loads all the hard new words.
//   - French domain validation: a noun must carry a gender, a verb must carry a
//     conjugation — enforced before a word can enter the deck.
//
// Everything here is pure (no Supabase, no React, no Date.now()) so it is unit
// tested directly. The persistence shape mirrors the `review_states` table:
//   { user_id, word_id, proficiency_level, next_review_at, streak_count, last_result }

export const CURVE_DAYS = [1, 2, 4, 7, 15, 30, 60, 120]
export const MAX_STAGE = CURVE_DAYS.length - 1
// A word is treated as "mastered" once it reaches this ladder stage (≈30-day
// interval) — strong enough retention to surface as a progress milestone
// without requiring the full MAX_STAGE, which is rarely reached.
export const MASTERED_STAGE = 5

export const REVIEW_RESULT = {
  correct: 'correct',
  wrong: 'wrong',
}

function toDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`srsScheduler: invalid date input: ${value}`)
  }
  return date
}

/**
 * Start-of-day (UTC) for the given instant, returned as a Date. Anchoring to the
 * day boundary is what makes same-day completions resurface together.
 */
function startOfUtcDay(value) {
  const date = toDate(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Clamp an arbitrary number to a valid ladder stage [0, MAX_STAGE].
 */
export function clampStage(stage) {
  if (!Number.isFinite(stage)) return 0
  return Math.max(0, Math.min(MAX_STAGE, Math.trunc(stage)))
}

/**
 * next_review_at for a freshly completed review at `now`, landing on the
 * day-anchored date CURVE_DAYS[stage] days later. Returns an ISO string.
 */
export function computeNextReviewAt(now, stage) {
  const anchor = startOfUtcDay(now)
  const days = CURVE_DAYS[clampStage(stage)]
  anchor.setUTCDate(anchor.getUTCDate() + days)
  return anchor.toISOString()
}

/**
 * Grade a review answer and return the next persisted state. Pure: callers pass
 * `now` explicitly. A correct answer advances one stage (capped) and grows the
 * streak; a wrong answer resets to stage 0 and zeroes the streak.
 */
export function gradeReviewState(state, result, now) {
  const prevLevel = clampStage(state?.proficiency_level ?? 0)
  const prevStreak = Number.isFinite(state?.streak_count) ? state.streak_count : 0
  const isCorrect = result === REVIEW_RESULT.correct

  const proficiency_level = isCorrect ? clampStage(prevLevel + 1) : 0
  const streak_count = isCorrect ? prevStreak + 1 : 0

  return {
    ...state,
    proficiency_level,
    streak_count,
    last_result: isCorrect ? REVIEW_RESULT.correct : REVIEW_RESULT.wrong,
    next_review_at: computeNextReviewAt(now, proficiency_level),
  }
}

/**
 * Build the initial state for a word a user has never seen. It is immediately
 * due (next_review_at = day anchor of `now`), i.e. eligible as a "new" card.
 */
export function createInitialState(userId, wordId, now) {
  return {
    user_id: userId,
    word_id: wordId,
    proficiency_level: 0,
    streak_count: 0,
    last_result: null,
    next_review_at: startOfUtcDay(now).toISOString(),
  }
}

/**
 * A state is due when its next_review_at is at or before `now`.
 */
export function isDue(state, now) {
  if (!state?.next_review_at) return true
  return toDate(state.next_review_at).getTime() <= toDate(now).getTime()
}

/**
 * Interleave new cards with due review cards: new, review, new, review, …
 * Whichever list is longer has its tail appended after the alternation runs out.
 * Inputs are not mutated.
 */
export function interleaveStates(newCards = [], reviewCards = []) {
  const out = []
  const max = Math.max(newCards.length, reviewCards.length)
  for (let i = 0; i < max; i += 1) {
    if (i < newCards.length) out.push(newCards[i])
    if (i < reviewCards.length) out.push(reviewCards[i])
  }
  return out
}

/**
 * Compose a study queue from a deck and the user's persisted review states.
 *
 *  - A deck word with NO state is a "new" card (seeded immediately-due).
 *  - A deck word whose state is due (next_review_at <= now) is a "review" card.
 *  - Review cards are ordered by next_review_at ascending (most overdue first).
 *  - New and review cards are interleaved (new, review, new, …) and each list is
 *    capped by maxNew / maxReview.
 *
 * Pure: `now`, `stateMap` and `deck` are all passed in. Each queue item is
 * { word, state, isNew }. `stateMap` maps word id → persisted state.
 */
export function buildStudyQueue({ deck = [], stateMap = {}, now, maxNew = 10, maxReview = 50 } = {}) {
  const newCards = []
  const reviewCards = []

  for (const word of deck) {
    const state = stateMap[word.id]
    if (!state) {
      newCards.push({ word, state: createInitialState(state?.user_id ?? null, word.id, now), isNew: true })
    } else if (isDue(state, now)) {
      reviewCards.push({ word, state, isNew: false })
    }
  }

  reviewCards.sort(
    (a, b) => new Date(a.state.next_review_at).getTime() - new Date(b.state.next_review_at).getTime(),
  )

  return interleaveStates(newCards.slice(0, maxNew), reviewCards.slice(0, maxReview))
}

/**
 * Progress snapshot over a deck given the user's review states. Pure.
 *   total     — deck size
 *   newCount  — words with no state yet (also counted as due)
 *   learning  — seen but below MASTERED_STAGE
 *   mastered  — at/above MASTERED_STAGE
 *   due       — studyable right now (new words + due review states)
 */
export function computeDeckStats({ deck = [], stateMap = {}, now, masteredStage = MASTERED_STAGE } = {}) {
  let newCount = 0
  let learning = 0
  let mastered = 0
  let due = 0

  for (const word of deck) {
    const state = stateMap[word.id]
    if (!state) {
      newCount += 1
      due += 1
      continue
    }
    if (clampStage(state.proficiency_level) >= masteredStage) {
      mastered += 1
    } else {
      learning += 1
    }
    if (isDue(state, now)) due += 1
  }

  return { total: deck.length, newCount, learning, mastered, due }
}

/**
 * Consecutive-day study streak ending today (or yesterday, if today's study is
 * not in yet). Derived from each state's `updated_at` (one row written per graded
 * answer), so distinct UTC dates ≈ days studied. Returns 0 if the most recent
 * studied day is older than yesterday (streak broken). Pure.
 */
export function computeStudyStreak(states = [], now) {
  const days = new Set()
  for (const state of states) {
    if (state?.updated_at) {
      days.add(startOfUtcDay(state.updated_at).toISOString())
    }
  }
  if (!days.size) return 0

  const today = startOfUtcDay(now)
  const yesterday = startOfUtcDay(now)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  let cursor
  if (days.has(today.toISOString())) {
    cursor = today
  } else if (days.has(yesterday.toISOString())) {
    cursor = yesterday
  } else {
    return 0
  }

  let streak = 0
  while (days.has(cursor.toISOString())) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

// ---- French domain validation ----------------------------------------------

export const FRENCH_GENDERS = new Set(['m', 'f'])

const NOUN_POS = new Set(['noun', 'n', 'nom'])
const VERB_POS = new Set(['verb', 'v', 'verbe'])

function normalizePos(pos = '') {
  return `${pos}`.trim().toLowerCase()
}

/**
 * Validate + normalize a French vocabulary entry before it enters the deck.
 * Returns { ok, errors, word }. A noun must carry a gender ('m' | 'f'); a verb
 * must carry a non-empty conjugation. Never throws.
 */
export function cleanFrenchWord(raw) {
  const errors = []
  const word = { ...raw }

  const french = `${raw?.french ?? ''}`.trim()
  const chinese = `${raw?.chinese ?? ''}`.trim()
  const pos = normalizePos(raw?.pos)

  if (!french) errors.push('缺少法语词条 (french)')
  if (!chinese) errors.push('缺少中文释义 (chinese)')
  if (!pos) errors.push('缺少词性 (pos)')

  if (NOUN_POS.has(pos)) {
    const gender = `${raw?.gender ?? ''}`.trim().toLowerCase()
    if (!FRENCH_GENDERS.has(gender)) {
      errors.push('名词必须标注阴阳性 gender ∈ {m, f}')
    } else {
      word.gender = gender
    }
  }

  if (VERB_POS.has(pos)) {
    const conjugation = raw?.conjugation
    const hasConjugation =
      (typeof conjugation === 'string' && conjugation.trim().length > 0) ||
      (conjugation && typeof conjugation === 'object' && Object.keys(conjugation).length > 0)
    if (!hasConjugation) {
      errors.push('动词必须提供变位 conjugation')
    }
  }

  word.french = french
  word.chinese = chinese
  word.pos = pos

  return { ok: errors.length === 0, errors, word }
}

/**
 * Filter a raw word list down to the entries that pass domain validation.
 * Returns { valid, rejected } where rejected carries the per-word errors.
 */
export function cleanFrenchDeck(rawWords = []) {
  const valid = []
  const rejected = []
  for (const raw of rawWords) {
    const result = cleanFrenchWord(raw)
    if (result.ok) {
      valid.push(result.word)
    } else {
      rejected.push({ word: raw, errors: result.errors })
    }
  }
  return { valid, rejected }
}
