import { isSupabaseConfigured, supabase } from './supabase'
import { sanitizeStoredUrl } from './safeUrl'
import { withRequestDeadline } from './requestDeadline'

const RESOURCE_COLUMNS = 'id,category,title,url,tag,description,curator,created_at,source_submission_id'

function mapResource(row) {
  return {
    id: `official-resource-${row.id}`,
    category: row.category || '未分类',
    title: row.title,
    url: sanitizeStoredUrl(row.url),
    tag: row.tag || '',
    description: row.description || '',
    curator: row.curator || '站点协作',
    createdAt: row.created_at,
    cloud: true,
    published: true,
    official: true,
    previewLabel: '正式发布',
    sourceSubmissionId: row.source_submission_id,
  }
}

// The public bookshelf depends only on resources. Retired album tables and
// editorial writes must not determine whether readers can load the catalog.
export async function fetchPublishedResources({ signal } = {}) {
  if (!isSupabaseConfigured || !supabase) return []

  return withRequestDeadline(async (requestSignal) => {
    const rows = []
    let cursor = null
    // Seek by primary key until an empty page: server limits can be below 500.
    do {
      let query = supabase.from('resources').select(RESOURCE_COLUMNS)
        .order('id', { ascending: true }).limit(500).abortSignal(requestSignal)
      if (cursor !== null) query = query.gt('id', cursor)
      const { data, error } = await query
      if (error) throw error
      if (!data?.length) break
      rows.push(...data)
      cursor = data.at(-1).id
    } while (cursor !== null)
    // Preserve newest-first publication order after collecting all pages.
    rows.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || b.id - a.id)
    return rows.map(mapResource)
  }, { signal })
}
