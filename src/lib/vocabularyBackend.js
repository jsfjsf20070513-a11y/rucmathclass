// Supabase persistence for the SRS vocabulary trainer's review_states table.
//
// Mirrors the graceful-degradation contract used across this repo's backends:
//   - mode 'disabled' : Supabase not configured (anon env missing)
//   - mode 'compat'   : table not created yet (run setup_vocabulary.sql)
//   - mode 'official' : table present, data flows
// review_states is per-user and RLS-guarded (a user may only see/write their own
// rows). The shared-Supabase red line applies: the RLS policy lives in
// setup_vocabulary.sql and must stay aligned with harden_rls.sql.

import { isSupabaseConfigured, supabase } from './supabase'
import { withRequestDeadline } from './requestDeadline'
import { sameReviewState } from './reviewSubmission'

export const REVIEW_STATES_TABLE = 'review_states'

export function isMissingTableError(error) {
  return error?.code === 'PGRST205' || `${error?.message || ''}`.toLowerCase().includes('schema cache')
}

/**
 * Fetch the user's review states as a map keyed by word_id.
 * Returns { mode, states } where states is {} unless mode === 'official'.
 */
export async function fetchReviewStateMap(userId) {
  if (!isSupabaseConfigured || !supabase) {
    return { mode: 'disabled', states: {} }
  }
  if (!userId) {
    return { mode: 'official', states: {} }
  }

  const states = {}
  let afterWord = null
  // Seek by the stable primary-key component. Continue even when the server
  // caps a page below our requested limit; only an empty page proves the end.
  for (;;) {
    const { data, error } = await withRequestDeadline((signal) => {
      let query = supabase.from(REVIEW_STATES_TABLE)
        .select('user_id, word_id, proficiency_level, next_review_at, streak_count, last_result, updated_at')
        .eq('user_id', userId).order('word_id', { ascending: true }).limit(500)
      if (afterWord !== null) query = query.gt('word_id', afterWord)
      return query.abortSignal(signal)
    })
    if (error) {
      if (isMissingTableError(error)) return { mode: 'compat', states: {} }
      throw error
    }
    if (!data?.length) break
    for (const row of data) states[row.word_id] = row
    const nextWord = data.at(-1).word_id
    if (nextWord === afterWord) throw new Error('进度读取未能完成，请重试。')
    afterWord = nextWord
  }
  return { mode: 'official', states }
}

/**
 * Save only if the version read by this exercise is still current. New words
 * use INSERT, never an upsert that could overwrite another device's progress.
 * The caller freezes the row/version before sending and reuses it on retry.
 */
export async function saveReviewState(state, expectedUpdatedAt = null) {
  if (!isSupabaseConfigured || !supabase) {
    return { mode: 'disabled', state }
  }
  if (!state?.user_id || !state?.word_id) {
    throw new Error('saveReviewState: user_id and word_id are required.')
  }

  const row = {
    user_id: state.user_id,
    word_id: state.word_id,
    proficiency_level: state.proficiency_level ?? 0,
    next_review_at: state.next_review_at,
    streak_count: state.streak_count ?? 0,
    last_result: state.last_result ?? null,
    updated_at: state.updated_at,
  }
  if (!row.updated_at) throw new Error('saveReviewState: a frozen updated_at is required.')

  const query = expectedUpdatedAt
    ? supabase.from(REVIEW_STATES_TABLE).update(row)
      .eq('user_id', row.user_id).eq('word_id', row.word_id).eq('updated_at', expectedUpdatedAt)
    : supabase.from(REVIEW_STATES_TABLE).insert(row)
  const { data, error } = await withRequestDeadline((signal) => query.select().abortSignal(signal).maybeSingle())

  if (error && error.code !== '23505') {
    if (isMissingTableError(error)) {
      return { mode: 'compat', state }
    }
    throw error
  }
  if (data) return { mode: 'official', state: data }

  // The previous response may have been lost AFTER the write committed.
  const { data: current, error: readError } = await withRequestDeadline((signal) => supabase.from(REVIEW_STATES_TABLE)
    .select('user_id, word_id, proficiency_level, next_review_at, streak_count, last_result, updated_at')
    .eq('user_id', row.user_id).eq('word_id', row.word_id).abortSignal(signal).maybeSingle())
  if (readError) throw readError
  if (sameReviewState(current, row)) return { mode: 'official', state: current }
  throw Object.assign(new Error('这道词的进度已在其他页面更新。本次没有覆盖，请重新加载进度。'), {
    code: 'REVIEW_CONFLICT', currentState: current,
  })
}

/**
 * Batch-upsert imported progress rows for a user. The caller-supplied rows have
 * no trustworthy user_id; we re-stamp it to `userId` here so an import can only
 * ever write the importing user's own rows (RLS enforces the same). Returns
 * { mode, count }.
 */
export async function importReviewStates(rows, userId) {
  if (!isSupabaseConfigured || !supabase) {
    return { mode: 'disabled', count: 0 }
  }
  if (!userId) {
    throw new Error('importReviewStates: userId is required.')
  }
  if (!rows?.length) {
    return { mode: 'official', count: 0 }
  }

  const stamped = rows.map((r) => ({
    user_id: userId,
    word_id: r.word_id,
    proficiency_level: r.proficiency_level ?? 0,
    next_review_at: r.next_review_at ?? new Date().toISOString(),
    streak_count: r.streak_count ?? 0,
    last_result: r.last_result ?? null,
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from(REVIEW_STATES_TABLE)
    .upsert(stamped, { onConflict: 'user_id,word_id' })
    .select('word_id')

  if (error) {
    if (isMissingTableError(error)) {
      return { mode: 'compat', count: 0 }
    }
    throw error
  }

  return { mode: 'official', count: data?.length ?? stamped.length }
}
