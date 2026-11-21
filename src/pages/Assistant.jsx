import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import AuthStatus from '../components/AuthStatus'
import PageNav from '../components/PageNav'
import { useAuth } from '../context/useAuth'
import { useArchiveScroll } from '../hooks/useArchiveScroll'
import { useAssistantArchive } from '../hooks/useAssistantArchive'
import { LEGACY_ID } from '../lib/aiAssistantBackend'
import { archiveDate } from '../lib/archiveDate'
import { flipNavigation, locationPath } from '../lib/flipNav'
import AssistantThread from '../components/AssistantThread'

const fromList = { fromAssistantList: true }

const noThreadSubscription = () => () => {}

function ConversationRow({ entry, open, reveal, pending, archive }) {
  const touch = useRef(null)
  const swiped = useRef(false)
  const thread = archive.cachedThread(entry.id)
  const busy = useSyncExternalStore(thread?.subscribe || noThreadSubscription, () => thread?.getSnapshot().busy || false)
  return (
    <li className={`cor-entry${open ? ' is-open' : ''}${pending ? ' is-pending' : ''}`}
      onTouchStart={(event) => {
        swiped.current = false
        touch.current = event.touches.length === 1 ? event.touches[0] : null
      }}
      onTouchCancel={() => { touch.current = null }}
      onTouchEnd={(event) => {
        if (!touch.current) return
        const dx = event.changedTouches[0].clientX - touch.current.clientX
        const dy = event.changedTouches[0].clientY - touch.current.clientY
        touch.current = null
        if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
          swiped.current = true
          reveal(dx < 0 ? entry.id : null)
        }
      }}
      onKeyDown={(event) => { if (event.key === 'Escape') reveal(null) }}
    >
      <Link className="lec-entry" to={`/assistant/${entry.id}`} state={fromList}
        aria-disabled={pending || undefined} tabIndex={pending ? -1 : undefined}
        onClick={(event) => {
          if (pending || swiped.current) event.preventDefault()
          swiped.current = false
        }}
      >
        <time className="lec-entry-date" dateTime={entry.updated_at} lang="fr">{archiveDate(entry.updated_at)}</time>
        <span className="lec-entry-title">{entry.title}</span>
      </Link>
      {pending ? (
        <button type="button" className="cor-delete" aria-label={`撤销删除“${entry.title}”`} disabled={!archive.canUndo(entry.id)} onClick={() => archive.undo(entry.id)}>撤销</button>
      ) : (
        <button type="button" className="cor-delete" disabled={busy} aria-label={`删除“${entry.title}”`}
          onClick={() => { reveal(null); archive.remove(entry.id) }}>删除</button>
      )}
    </li>
  )
}

function Conversations({ userId, homeNav }) {
  const { id } = useParams()
  const archiveScroll = useArchiveScroll()
  const location = useLocation()
  const navigate = useNavigate()
  const { archive, entries, pending, mode, error } = useAssistantArchive(userId)
  const draft = id === 'new'
  const draftId = useMemo(() => draft ? crypto.randomUUID() : null, [draft])
  const [revealed, reveal] = useState(null)
  const single = mode && mode !== 'official'
  const threadId = single ? LEGACY_ID : draft ? draftId : id
  const listLink = <nav className="page-nav" aria-label="页内导航">
    <Link className="page-nav-back" lang="fr" to="/assistant" onClick={(event) => {
      if (location.state?.fromAssistantList && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        navigate(-1)
      }
    }}>Conversations</Link>
  </nav>

  if (!id) return (
    <main className="lec cor cor-archive" data-page-ready={Boolean(mode || error)}>
      {homeNav}
      <div className="lec-scroll" ref={archiveScroll}>
        <ol className="lec-archive" aria-label="对话列表">
          {mode && (!single || !entries.length) && <li><Link className="lec-entry" to="/assistant/new" state={fromList}>
            <span className="lec-entry-title">新对话</span>
          </Link></li>}
          {entries.map((entry) => <ConversationRow key={entry.id} entry={entry} open={entry.id === revealed}
            pending={pending.includes(entry.id)} reveal={reveal} archive={archive} />)}
        </ol>
        {error && <p className="cor-error" role="alert">{error}</p>}
      </div>
    </main>
  )

  if (!mode) return <main className="cor" data-page-ready={Boolean(error)}>{listLink}{error && <p className="cor-error" role="alert">{error}</p>}</main>
  if ((single && !draft && id !== LEGACY_ID) || (single && draft && entries.length)) {
    return <Navigate to={`/assistant/${LEGACY_ID}`} replace state={location.state} />
  }
  if (pending.includes(threadId) || (!draft && !entries.some((entry) => entry.id === threadId) && !archive.cachedThread(threadId))) {
    return <Navigate to="/assistant" replace />
  }
  return (
    <main className="cor">
      {listLink}
      <AssistantThread key={threadId} conversation={archive.thread(threadId)} rise={Boolean(location.state?.fromAssistantList)}
        onStart={draft ? () => navigate(`/assistant/${threadId}`, { replace: true, state: location.state }) : undefined} />
    </main>
  )
}

export default function Assistant() {
  const { user, loading, error } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const homeNav = <PageNav title="" onBack={() => { flipNavigation.mark('/assistant', '/'); navigate('/') }} />
  if (user && !loading && !error) return <Conversations key={user.id} userId={user.id} homeNav={homeNav} />
  return (
    <main className="cor" data-page-ready={!loading}>
      {homeNav}
      <div className="cor-gate">
        {loading || error ? <AuthStatus className="page-notice" /> : <>
          <p className="page-kicker" lang="fr">Connexion requise</p>
          <p className="page-notice">登录后即可使用班级 AI 助手 —— 双语数学答疑,可拍题问图。</p>
          <Link className="text-action" to="/login" state={{ returnTo: locationPath(location), gateKey: location.key }}>Connexion&nbsp;&nbsp;→</Link>
        </>}
      </div>
    </main>
  )
}
