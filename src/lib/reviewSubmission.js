import { gradeReviewState, REVIEW_RESULT } from './srsScheduler'

// One frozen attempt is retried as-is. A retry must not grade the word again.
export function createReviewSubmission({ state, userId, wordId, correct, now }) {
  const expectedUpdatedAt = state?.updated_at || null
  const next = gradeReviewState(
    { ...state, user_id: userId, word_id: wordId },
    correct ? REVIEW_RESULT.correct : REVIEW_RESULT.wrong,
    now,
  )
  const version = Math.max(new Date(now).getTime(), (Date.parse(expectedUpdatedAt) || 0) + 1)
  return { correct, expectedUpdatedAt, state: { ...next, updated_at: new Date(version).toISOString() } }
}

export function sameReviewState(a, b) {
  if (!a || !b) return false
  return ['user_id', 'word_id', 'proficiency_level', 'streak_count', 'last_result'].every((key) => a[key] === b[key])
    && ['updated_at', 'next_review_at'].every((key) => {
      const subMs = (value) => (`${value}`.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0').slice(3)
      return Date.parse(a[key]) === Date.parse(b[key]) && subMs(a[key]) === subMs(b[key])
    })
}

export function recordSessionScore(stats, correct) {
  const combo = correct ? stats.combo + 1 : 0
  return {
    correct: stats.correct + (correct ? 1 : 0), attempts: stats.attempts + 1,
    combo, maxCombo: Math.max(stats.maxCombo, combo),
  }
}

// Called only after confirmed persistence; also used to reconcile an attempt
// interrupted by refresh. The snapshot retains the original score until then.
export function confirmSnapshot(snapshot) {
  const pending = snapshot?.pending
  if (!pending) return snapshot
  const wordId = pending.state.word_id
  return {
    ...snapshot, pending: null, i: snapshot.i + 1,
    stats: recordSessionScore(snapshot.stats, pending.correct),
    wrongIds: pending.correct ? snapshot.wrongIds : [...new Set([...snapshot.wrongIds, wordId])],
  }
}
