import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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

const drawMs = 180
const holdMs = 120

async function collapseRow(row, started) {
  // 慢回执到达时，已经画完并停留过的线可以直接收起。
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const remaining = started + drawMs + holdMs - performance.now()
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining))
  }
  if (!row.isConnected) return
  row.classList.add('is-collapsing')
  await Promise.allSettled(row.getAnimations({ subtree: true }).map((animation) => animation.finished))
}

function ConversationStrike({ pending }) {
  const svg = useRef(null)
  const [keepUntilRetracted, setKeepUntilRetracted] = useState(false)
  useLayoutEffect(() => {
    const animation = svg.current?.getAnimations()[0]
    if (pending) {
      setKeepUntilRetracted(true)
      if (animation?.playbackRate < 0) animation.reverse()
      return
    }
    if (!animation) {
      setKeepUntilRetracted(false)
      return
    }
    // 删除失败时，从笔尖当前位置收回细线。
    animation.reverse()
    let active = true
    const hide = () => { if (active) setKeepUntilRetracted(false) }
    animation.finished.then(hide, hide)
    return () => { active = false }
  }, [pending])
  if (!pending && !keepUntilRetracted) return null
  return (
    <svg ref={svg} className="cor-strike" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path transform="matrix(1 -.026 0 1 0 3.3)" d="M0 -.08 Q40 -1.25 100 0 Q40 1.25 0 .08Z" />
    </svg>
  )
}

function ConversationRow({ entry, managing, pending, archive }) {
  const thread = archive.cachedThread(entry.id)
  const busy = useSyncExternalStore(thread?.subscribe || noThreadSubscription, () => thread?.getSnapshot().busy || false)
  return (
    <li className={`cor-entry${pending ? ' is-pending' : ''}`}>
      <div className="cor-entry-clip">
        <div className="cor-entry-content">
          <Link className="lec-entry" to={`/assistant/${entry.id}`} state={fromList}
            aria-disabled={pending || undefined} tabIndex={pending ? -1 : undefined}
            onClick={pending ? (event) => event.preventDefault() : undefined}
          >
            <time className="lec-entry-date" dateTime={entry.updated_at} lang="fr">{archiveDate(entry.updated_at)}</time>
            <span className="lec-entry-title">
              <span className="cor-title-text">{entry.title}</span>
              <ConversationStrike pending={pending} />
            </span>
          </Link>
          {(pending || managing) && (
            <button type="button" className="cor-delete" disabled={pending || busy}
              aria-label={`删除“${entry.title}”`}
              onClick={(event) => {
                const row = event.currentTarget.closest('li')
                const started = performance.now()
                archive.remove(entry.id, () => collapseRow(row, started))
              }}>
              删除
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function ConversationList({ history, scrollRef, onHome }) {
  const { archive, entries, deletions, mode, error } = history
  const [managing, setManaging] = useState(false)
  return (
    <main className="lec cor cor-archive" style={{ '--cor-strike-duration': `${drawMs}ms` }} data-page-ready={Boolean(mode || error)}>
      <PageNav onBack={onHome}>
        <button type="button" className="page-nav-back cor-manage" aria-expanded={managing} aria-controls="conversation-list"
          disabled={!entries.length && !managing} onClick={() => setManaging(!managing)}>
          {managing ? '完成' : '管理'}
        </button>
      </PageNav>
      <div className="lec-scroll" ref={scrollRef}>
        <ol className="lec-archive" id="conversation-list" aria-label="对话列表">
          {mode && (mode === 'official' || !entries.length) && <li><Link className="lec-entry" to="/assistant/new" state={fromList}>
            <span className="lec-entry-title">新对话</span>
          </Link></li>}
          {entries.map((entry) => <ConversationRow key={entry.id} entry={entry} managing={managing}
            pending={Boolean(deletions[entry.id])} archive={archive} />)}
        </ol>
        {error && <p className="cor-error" role="alert">{error}</p>}
      </div>
    </main>
  )
}

function Conversations({ userId, onHome }) {
  const { id } = useParams()
  const archiveScroll = useArchiveScroll()
  const location = useLocation()
  const navigate = useNavigate()
  const history = useAssistantArchive(userId)
  const { archive, entries, deletions, mode, error } = history
  const draft = id === 'new'
  const draftId = useMemo(() => draft ? crypto.randomUUID() : null, [draft])
  const single = mode && mode !== 'official'
  const threadId = single ? LEGACY_ID : draft ? draftId : id
  const listLink = (
    <PageNav label="Conversations" to="/assistant" onBack={(event) => {
      if (location.state?.fromAssistantList && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        navigate(-1)
      }
    }} />
  )

  if (!id) return <ConversationList history={history} scrollRef={archiveScroll} onHome={onHome} />
  if (!mode) return <main className="cor" data-page-ready={Boolean(error)}>{listLink}{error && <p className="cor-error" role="alert">{error}</p>}</main>
  if ((single && !draft && id !== LEGACY_ID) || (single && draft && entries.length)) {
    return <Navigate to={`/assistant/${LEGACY_ID}`} replace state={location.state} />
  }
  if (deletions[threadId] || (!draft && !entries.some((entry) => entry.id === threadId) && !archive.cachedThread(threadId))) {
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
  const goHome = () => {
    flipNavigation.mark('/assistant', '/')
    navigate('/')
  }
  if (user && !loading && !error) return <Conversations key={user.id} userId={user.id} onHome={goHome} />
  return (
    <main className="cor" data-page-ready={!loading}>
      <PageNav onBack={goHome} />
      <div className="cor-gate">
        {loading || error ? <AuthStatus className="page-notice" /> : <>
          <p className="page-notice">登录后即可使用班级 AI 助手 —— 双语数学答疑,可拍题问图。</p>
          <Link className="text-action" to="/login" state={{ returnTo: locationPath(location), gateKey: location.key }}>Connexion&nbsp;&nbsp;→</Link>
        </>}
      </div>
    </main>
  )
}
