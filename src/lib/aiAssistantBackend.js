import { isSupabaseConfigured, supabase } from './supabase'
import { withRequestDeadline } from './requestDeadline'

export const AI_MESSAGES_TABLE = 'ai_messages'
const conversationsTable = 'ai_conversations'
export const LEGACY_ID = 'legacy'

function isMissingTable(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

export function questionTitle(content) {
  return Array.from(content.split('\n[此问题附有图片')[0].trim()).slice(0, 200).join('') || '对话'
}

async function legacyArchive(userId) {
  // 单独取最早的问题，旧记录超过 200 条时标题也准确。
  const readOne = (first) => withRequestDeadline((signal) => {
    let query = supabase.from(AI_MESSAGES_TABLE).select('id, role, content, created_at').eq('user_id', userId)
    if (first) query = query.eq('role', 'user').order('created_at', { ascending: true })
    return query.order('id', { ascending: first }).limit(1).abortSignal(signal).maybeSingle()
  })
  const [first, last] = await Promise.all([readOne(true), readOne(false)])
  const error = first.error || last.error
  if (isMissingTable(error)) return { mode: 'compat', entries: [] }
  if (error) throw error
  const entries = last.data ? [{
    id: LEGACY_ID, title: questionTitle(first.data?.content || ''), updated_at: last.data.created_at, lastMessageId: last.data.id,
  }] : []
  return { mode: 'legacy', entries }
}

export async function fetchConversations(userId) {
  if (!isSupabaseConfigured || !supabase) return { mode: 'disabled', entries: [] }
  const entries = []
  const pageSize = 100
  let after, total
  do {
    const { data, count, error } = await withRequestDeadline((signal) => {
      let query = supabase.from(conversationsTable).select('id, title, updated_at', after ? {} : { count: 'exact' })
        .eq('user_id', userId).order('id', { ascending: true }).limit(pageSize)
      if (after) query = query.gt('id', after)
      return query.abortSignal(signal)
    })
    if (isMissingTable(error)) return legacyArchive(userId)
    if (error) throw error
    total ??= count
    entries.push(...data)
    after = data.at(-1)?.id
    if (total == null && data.length < pageSize) break
  } while (after && (total == null || entries.length < total))
  entries.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))
  return { mode: 'official', entries }
}

export async function fetchMessages(userId, limit = 200, conversationId = LEGACY_ID) {
  if (!isSupabaseConfigured || !supabase) return { mode: 'disabled', messages: [] }
  if (!userId) return { mode: 'official', messages: [] }

  const { data, error } = await withRequestDeadline((signal) => {
    let query = supabase.from(AI_MESSAGES_TABLE).select('role, content, created_at').eq('user_id', userId)
    if (conversationId !== LEGACY_ID) query = query.eq('conversation_id', conversationId)
    return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit).abortSignal(signal)
  })
  if (isMissingTable(error)) return { mode: 'compat', messages: [] }
  if (error) throw error
  return { mode: 'official', messages: data.reverse().map(({ role, content }) => ({ role, content })) }
}

export async function saveTurn(userId, userMessage, reply, conversationId = LEGACY_ID, title = null) {
  if (!isSupabaseConfigured || !supabase) return { mode: 'disabled' }
  if (!userId) throw new Error('saveTurn: userId is required.')

  const question = (userMessage.content + (userMessage.imageData ? '\n[此问题附有图片；图片仅在发送时的页面内可用，继续问图请重新上传。]' : '')).slice(0, 20000)
  const answer = reply.content.slice(0, 20000)
  if (conversationId !== LEGACY_ID) {
    const { data, error } = await withRequestDeadline((signal) => supabase.rpc('save_ai_turn', {
      p_user_id: userId, p_id: conversationId, p_title: title, p_question: question, p_reply: answer,
    }).abortSignal(signal))
    if (error) throw error
    return { mode: 'official', updated_at: data }
  }

  const created = Date.now()
  const rows = [question, answer].map((content, index) => ({
    user_id: userId, role: index === 0 ? 'user' : 'model', content, created_at: new Date(created + index).toISOString(),
  }))
  const { data, error } = await withRequestDeadline((signal) => supabase.from(AI_MESSAGES_TABLE).insert(rows).select('id').abortSignal(signal))
  if (isMissingTable(error)) return { mode: 'compat' }
  if (error) throw error
  return { mode: 'official', updated_at: rows[1].created_at, lastMessageId: data?.at(-1)?.id }
}

export async function deleteConversation(userId, entry) {
  if (entry.id === LEGACY_ID) return clearMessages(userId, entry.lastMessageId)
  // 另一台设备已经续写时，保留新消息，交给用户刷新后核对。
  const { data, error } = await withRequestDeadline((signal) => supabase.from(conversationsTable).delete()
    .eq('user_id', userId).eq('id', entry.id).eq('updated_at', entry.updated_at).select('id').abortSignal(signal))
  if (error) throw error
  if (!data?.length) throw new Error('Conversation changed')
  return { mode: 'official' }
}

export async function clearMessages(userId, lastMessageId) {
  if (!isSupabaseConfigured || !supabase) return { mode: 'disabled' }
  if (!userId) return { mode: 'official' }

  const { data: latest, error: readError } = await withRequestDeadline((signal) => supabase.from(AI_MESSAGES_TABLE)
    .select('id').eq('user_id', userId).order('id', { ascending: false }).limit(1).abortSignal(signal).maybeSingle())
  if (isMissingTable(readError)) return { mode: 'compat' }
  if (readError) throw readError
  if (!latest) return { mode: 'official' }
  if (lastMessageId != null && latest.id !== lastMessageId) throw new Error('Conversation changed')
  const { error } = await withRequestDeadline((signal) => supabase.from(AI_MESSAGES_TABLE).delete()
    .eq('user_id', userId).lte('id', latest.id).abortSignal(signal))
  if (isMissingTable(error)) return { mode: 'compat' }
  if (error) throw error
  return { mode: 'official' }
}
