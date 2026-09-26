// Supabase persistence for the 班级 AI 助手 conversation history (ai_messages).
//
// Mirrors the graceful-degradation contract used across this repo's backends:
//   - mode 'disabled' : Supabase not configured (anon env missing)
//   - mode 'compat'   : table not created yet (run setup_ai_history.sql)
//   - mode 'official' : table present, data flows
// ai_messages is per-user and RLS-guarded (a user may only read/insert/delete
// their own rows). Shared-Supabase red line: the RLS policy lives in
// setup_ai_history.sql and must keep the self-scope guards.

import { isSupabaseConfigured, supabase } from './supabase'
import { withRequestDeadline } from './requestDeadline'

export const AI_MESSAGES_TABLE = 'ai_messages'

function isMissingTableError(error) {
  return error?.code === 'PGRST205' || `${error?.message || ''}`.toLowerCase().includes('schema cache')
}

/**
 * Load the user's saved conversation (chronological). Returns { mode, messages }
 * where messages is [] unless mode === 'official'. Each message is { role, content }.
 */
export async function fetchMessages(userId, limit = 200) {
  if (!isSupabaseConfigured || !supabase) return { mode: 'disabled', messages: [] }
  if (!userId) return { mode: 'official', messages: [] }

  const { data, error } = await withRequestDeadline((signal) => supabase
    .from(AI_MESSAGES_TABLE)
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit).abortSignal(signal))

  if (error) {
    if (isMissingTableError(error)) return { mode: 'compat', messages: [] }
    throw error
  }
  return { mode: 'official', messages: [...(data || [])].reverse().map((r) => ({ role: r.role, content: r.content })) }
}

/**
 * Persist a complete turn in one insert. Images stay in page memory; their
 * absence after reload is stated in the persisted user message.
 */
export async function saveTurn(userId, userMessage, reply) {
  if (!isSupabaseConfigured || !supabase) return { mode: 'disabled' }
  if (!userId) throw new Error('saveTurn: userId is required.')

  const createdAt = Date.now()
  const rows = [userMessage, reply].map((message, index) => ({
    user_id: userId, role: index === 0 ? 'user' : 'model',
    content: `${message.content}${message.imageData ? '\n[此问题附有图片；图片仅在发送时的页面内可用，继续问图请重新上传。]' : ''}`.slice(0, 20000),
    created_at: new Date(createdAt + index).toISOString(),
  }))

  const { error } = await withRequestDeadline((signal) => supabase
    .from(AI_MESSAGES_TABLE)
    .insert(rows).abortSignal(signal))

  if (error) {
    if (isMissingTableError(error)) return { mode: 'compat' }
    throw error
  }
  return { mode: 'official' }
}

/**
 * Delete all of the user's saved messages (the « 清空历史 » action).
 */
export async function clearMessages(userId) {
  if (!isSupabaseConfigured || !supabase) return { mode: 'disabled' }
  if (!userId) return { mode: 'official' }

  // Freeze a cutoff before deleting so a delayed DELETE can never remove
  // messages created after this clear operation began (including other tabs).
  const { data: latest, error: readError } = await withRequestDeadline((signal) => supabase.from(AI_MESSAGES_TABLE)
    .select('id').eq('user_id', userId).order('id', { ascending: false }).limit(1).abortSignal(signal).maybeSingle())
  if (readError) {
    if (isMissingTableError(readError)) return { mode: 'compat' }
    throw readError
  }
  if (!latest) return { mode: 'official' }
  const { error } = await withRequestDeadline((signal) => supabase.from(AI_MESSAGES_TABLE).delete()
    .eq('user_id', userId).lte('id', latest.id).abortSignal(signal))
  if (error) {
    if (isMissingTableError(error)) return { mode: 'compat' }
    throw error
  }
  return { mode: 'official' }
}
