import { isSupabaseConfigured, supabase } from './supabase'
import { sanitizeStoredUrl } from './safeUrl'
import { emitOfficialContentUpdated } from './contentEvents'

const FALLBACK_COVER = 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80'

function normalizeDate(value) {
  if (!value) return ''
  return `${value}`.includes('T') ? `${value}`.slice(0, 10) : `${value}`
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

export function isMissingTableError(error) {
  return error?.code === 'PGRST205' || `${error?.message || ''}`.toLowerCase().includes('schema cache')
}

async function ensureOfficialTables(tables) {
  if (!isSupabaseConfigured || !supabase) {
    return { ready: false, mode: 'disabled' }
  }

  const checks = await Promise.all(
    tables.map(async (table) => {
      const result = await supabase.from(table).select('id').limit(1)
      return { table, ...result }
    }),
  )

  const missing = checks.find((entry) => isMissingTableError(entry.error))
  if (missing) {
    return { ready: false, mode: 'compat' }
  }

  const fatal = checks.find((entry) => entry.error)
  if (fatal) {
    throw fatal.error
  }

  return { ready: true, mode: 'official' }
}

export async function publishOfficialContent(kind, submission, user) {
  if (!isSupabaseConfigured || !supabase) {
    return { mode: 'disabled' }
  }

  if (!submission?.id) {
    throw new Error('缺少要发布的协作稿。')
  }

  const payload = submission.payload || {}

  if (kind === 'gallery') {
    const tableState = await ensureOfficialTables(['albums', 'album_photos'])
    if (!tableState.ready) {
      return tableState
    }

    const albumPhotos = ensureArray(payload.photos)
    const { data: albumRow, error: albumError } = await supabase
      .from('albums')
      .upsert([{
        title: payload.title || '未命名相册',
        description: payload.description || '',
        featured: false,
        cover: payload.cover || albumPhotos[0] || FALLBACK_COVER,
        date: payload.date || normalizeDate(submission.createdAt),
        updated_at: new Date().toISOString(),
        location: payload.location || '待补充',
        recorded_by: submission.authorName || '站点协作',
        source_submission_id: submission.id,
        published_by: user?.id || null,
      }], { onConflict: 'source_submission_id' })
      .select()
      .single()

    if (albumError) {
      throw albumError
    }

    const { error: deleteError } = await supabase
      .from('album_photos')
      .delete()
      .eq('album_id', albumRow.id)

    if (deleteError) {
      throw deleteError
    }

    const photosToInsert = (albumPhotos.length ? albumPhotos : [payload.cover || FALLBACK_COVER]).map((src, index) => ({
      album_id: albumRow.id,
      src,
      caption: `协作图片 ${index + 1}`,
      position: index,
    }))

    const { error: photoError } = await supabase
      .from('album_photos')
      .insert(photosToInsert)

    if (photoError) {
      throw photoError
    }

    emitOfficialContentUpdated()
    return { mode: 'official' }
  }

  if (kind === 'resource') {
    const tableState = await ensureOfficialTables(['resources'])
    if (!tableState.ready) {
      return tableState
    }

    const { error } = await supabase
      .from('resources')
      .upsert([{
        category: payload.category || '未分类',
        title: payload.title || '未命名资源',
        url: sanitizeStoredUrl(payload.url),
        tag: payload.tag || '',
        description: payload.description || '',
        curator: submission.authorName || '站点协作',
        source_submission_id: submission.id,
        published_by: user?.id || null,
      }], { onConflict: 'source_submission_id' })

    if (error) {
      throw error
    }

    emitOfficialContentUpdated()
    return { mode: 'official' }
  }

  return { mode: 'compat' }
}

export async function removeOfficialContent(kind, submission) {
  if (!isSupabaseConfigured || !supabase) {
    return { mode: 'disabled' }
  }

  if (!submission?.id) {
    return { mode: 'compat' }
  }

  if (kind === 'gallery') {
    const tableState = await ensureOfficialTables(['albums'])
    if (!tableState.ready) {
      return tableState
    }

    const { error } = await supabase
      .from('albums')
      .delete()
      .eq('source_submission_id', submission.id)

    if (error) {
      throw error
    }

    emitOfficialContentUpdated()
    return { mode: 'official' }
  }

  if (kind === 'resource') {
    const tableState = await ensureOfficialTables(['resources'])
    if (!tableState.ready) {
      return tableState
    }

    const { error } = await supabase
      .from('resources')
      .delete()
      .eq('source_submission_id', submission.id)

    if (error) {
      throw error
    }

    emitOfficialContentUpdated()
    return { mode: 'official' }
  }

  return { mode: 'compat' }
}
