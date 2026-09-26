import { supabase, isSupabaseConfigured, SUPABASE_MISSING_MESSAGE } from './supabase'
import { sanitizeStoredUrl } from './safeUrl'
import { withRequestDeadline } from './requestDeadline'

// Existing persisted format. album_id is a queue marker, not an album feature.
// Read only these columns: the contact email is written but never selected.
export const RECOMMENDATION_COLUMNS = 'id,album_id,content,user_id,user_nickname,created_at'
const PREFIX = '__mathclass_ops__::'
const trim = (value = '') => `${value}`.trim()

export function normalizeResourcePayload(form) {
  return {
    category: trim(form.category), title: trim(form.title), url: sanitizeStoredUrl(form.url),
    tag: trim(form.tag), description: trim(form.description),
  }
}

export async function submitResourceRecommendation(form, user) {
  if (!isSupabaseConfigured || !supabase) throw new Error(SUPABASE_MISSING_MESSAGE)
  if (!user?.id) throw new Error('推荐资源需要先登录。')
  const payload = normalizeResourcePayload(form)
  if (!payload.title || !payload.category || !payload.url) throw new Error('请填写书架、标题和有效的资源链接。')
  const result = await withRequestDeadline((signal) => supabase.from('comments').insert([{
    album_id: 0,
    content: `${PREFIX}${JSON.stringify({ version: 1, kind: 'resource', payload })}`,
    user_id: user.id, user_email: user.email,
    user_nickname: user.user_metadata?.nickname || user.email || '同学',
    created_at: new Date().toISOString(),
  }]).select(RECOMMENDATION_COLUMNS).abortSignal(signal).single())
    .catch(() => { throw uncertainResult() })
  if (result.error) {
    // PostgREST error codes establish a rejected write; transport failures do
    // not establish whether the row was committed. Do not invite a duplicate.
    if (/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(result.error.code || '')) throw new Error(result.error.message || '提交未成功，请稍后重试。')
    throw uncertainResult()
  }
  if (!result.data?.id) throw uncertainResult()
  return { id: result.data.id, title: payload.title }
}

function uncertainResult() {
  return Object.assign(new Error('暂时无法确认提交结果，请勿重复提交；可以先返回资源页。'), { code: 'SUBMISSION_UNCONFIRMED' })
}
