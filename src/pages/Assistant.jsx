import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import katex from 'katex'
import { useAuth } from '../context/useAuth'
import AuthStatus from '../components/AuthStatus'
import { useAssistantConversation } from '../hooks/useAssistantConversation'
import { markFlipNav, wasFlipNav } from '../lib/flipNav'

// 把助手回复里的 $...$ / $$...$$ 渲染成 KaTeX 公式,**粗体** 转 <strong>,其余
// 文本 HTML 转义后原样保留(容器 white-space:pre-wrap 负责换行)。KaTeX 输出是
// 安全 HTML;katex 随本 lazy 路由加载,不进主包。
const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function escapeHtml(s) {
  return `${s}`.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}
function renderProse(s) {
  // 除 **粗体** 外,把模型常吐的轻量 markdown 清理成书信体排版:
  // ### 标题 → 小节强调行;* / - 列表 → · 引导;--- → 短发丝线;> 引文去尖括号。
  return escapeHtml(s)
    .replace(/^#{1,4}\s+(.+)$/gm, '<strong class="cor-h">$1</strong>')
    .replace(/^\s*---+\s*$/gm, '<span class="cor-hr" aria-hidden="true"></span>')
    .replace(/^\s*[*-]\s+/gm, '· ')
    .replace(/^\s*&gt;\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 加粗跨过公式边界时配不上对:残余的裸 ** 直接清掉,不让星号见人
    .replace(/\*\*/g, '')
}
function renderRich(text) {
  const out = []
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(renderProse(text.slice(last, m.index)))
    const display = m[1] !== undefined
    const expr = display ? m[1] : m[2]
    try {
      out.push(katex.renderToString(expr, { throwOnError: false, displayMode: display, output: 'html' }))
    } catch {
      out.push(escapeHtml(m[0]))
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(renderProse(text.slice(last)))
  return out.join('')
}

// 答疑 Assistant — 2026-08 编排版「Correspondance 书信体」(宪法 §5.4):
// 空状态(刊头 + 起手问题细字链)与对话态是两个停顿;Q./R. 小型悬挂眉头,
// 答句挂发丝左线(自上而下画出),等待指示是一根呼吸发丝线;拍题照片
// 渲染为「Figure n」编号图框。会话与网络生命周期由 useAssistantConversation 管理。

const STARTERS = [
  '用中文解释一下中值定理的直觉',
  'Conjugue le verbe « résoudre » au présent',
  '« dérivée » 是阴性还是阳性?给个例句',
  'Explique la différence entre limite et continuité',
]

// 选图后在浏览器里压缩:缩到最长边 1536、转 JPEG q0.85——既省 token 又统一格式。
// 返回 { mimeType, data(纯 base64), preview(data URL 用于缩略图) }。
async function compressImage(file) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
  const img = await new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = dataUrl
  })
  const maxDim = 1536
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  const out = canvas.toDataURL('image/jpeg', 0.85)
  return { mimeType: 'image/jpeg', data: out.split(',')[1], preview: out }
}

function getFrDateLabel() {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

export default function Assistant() {
  const { user, loading: authLoading, error: authError } = useAuth()
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const { messages, busy, loading, error: conversationError, notice, send: sendMessage, clear: handleClear } = useAssistantConversation(user?.id)
  const [error, setError] = useState('')
  const [image, setImage] = useState(null) // { mimeType, data, preview }
  const [arrive] = useState(() => wasFlipNav())
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const imageGeneration = useRef(0)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  // 背词答错跳转带来的上下文(?term=&answer=):预填一条解释请求,不自动发送。
  useEffect(() => {
    imageGeneration.current += 1
    setImage(null)
    setError('')
    const params = new URLSearchParams(window.location.search)
    const term = params.get('term')
    if (!term) { setInput(''); return }
    const answer = params.get('answer')
    setInput(`请解释法语词 « ${term} »${answer ? `,并分析我刚才的答案「${answer}」为什么不对` : ''}。`)
  }, [user?.id])

  const send = useCallback(async (text) => {
    imageGeneration.current += 1
    setError('')
    if (await sendMessage(`${text}`, image)) {
      setInput('')
      setImage(null)
      inputRef.current?.focus()
    }
  }, [sendMessage, image])

  const onPickImage = useCallback(async (event) => {
    const generation = ++imageGeneration.current
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('只支持图片文件。')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('图片太大,请小于 12MB。')
      return
    }
    try {
      setError('')
      const compressed = await compressImage(file)
      if (generation === imageGeneration.current) setImage(compressed)
    } catch {
      if (generation === imageGeneration.current) setError('图片处理失败,换一张试试。')
    }
  }, [])

  const goHome = useCallback(() => {
    markFlipNav('/assistant')
    navigate('/')
  }, [navigate])

  // 「Figure n」编号:按 user 消息里带图的先后顺序计数。
  let figureCounter = 0

  const nav = (
    <nav className="vpl-nav" aria-label="页内导航">
      <button type="button" className="vpl-nav-back" onClick={goHome} lang="fr">← Accueil</button>
      <span className="vpl-nav-title" lang="fr">Correspondance</span>
      {messages.length ? (
        <button type="button" className="vpl-nav-back cor-effacer" onClick={handleClear} disabled={busy} lang="fr">Effacer · 清空</button>
      ) : (
        <span className="vpl-nav-side">{authLoading || authError ? '登录状态待确认' : user ? (busy ? 'Chargement…' : 'Historique · 对话') : '未登录'}</span>
      )}
    </nav>
  )

  if (authLoading || authError) {
    return <main className={`cor${arrive ? ' mag-arrive' : ''}`}>{nav}<div className="cor-gate"><AuthStatus className="vpl-notice-text" /></div></main>
  }
  if (!user) {
    return (
      <main className={`cor${arrive ? ' mag-arrive' : ''}`}>
        {nav}
        <div className="cor-gate">
          <p className="vpl-kicker" lang="fr">Connexion requise</p>
          <p className="vpl-notice-text">登录后即可使用班级 AI 助手 —— 双语数学答疑,可拍题问图。</p>
          <Link className="mag-enter" to="/login">Connexion&nbsp;&nbsp;→</Link>
        </div>
      </main>
    )
  }

  return (
    <main className={`cor${arrive ? ' mag-arrive' : ''}`}>
      {nav}

      {messages.length === 0 && !loading ? (
        /* ── 停顿一:刊头空状态 ── */
        <div className="cor-cover" key="cover">
          <p className="vpl-kicker" data-animate="" style={{ animationDelay: '0.1s' }} lang="fr">Assistant · 班级答疑</p>
          <h1 className="cor-masthead" lang="fr">Correspondance</h1>
          <p className="cor-sub" lang="fr">Pose une question de maths ou de français — en chinois ou en français.</p>
          <div className="cor-starters">
            {STARTERS.map((s, k) => (
              <button
                key={s}
                type="button"
                className="cor-starter"
                style={{ animationDelay: `${0.35 + k * 0.12}s` }}
                onClick={() => send(s)}
                disabled={busy}
                lang={/[a-zA-Zéèàçù]/.test(s[0]) ? 'fr' : undefined}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── 停顿二:信笺流 ── */
        <div className="cor-thread" ref={scrollRef} key="thread">
          <div className="cor-thread-inner">
            <div className="cor-dateline" aria-hidden="true">
              <span className="cor-dateline-rule" />
              <p lang="fr">{`Le ${getFrDateLabel()}`}</p>
              <span className="cor-dateline-rule" />
            </div>
            {messages.map((m, idx) => {
              if (m.role === 'user') {
                const fig = m.image ? ++figureCounter : 0
                return (
                  <div key={idx} className="cor-turn">
                    <span className="cor-mark is-q" aria-hidden="true">Q.</span>
                    <div className="cor-q-body">
                      {m.image ? (
                        <figure className="cor-figure">
                          <figcaption lang="fr">{`Figure ${fig} · 拍题照片（仅本次页面保留）`}</figcaption>
                          <img src={m.image} alt={`Figure ${fig}`} />
                        </figure>
                      ) : null}
                      <p className="cor-q-text">{m.content}</p>
                    </div>
                  </div>
                )
              }
              return (
                <div key={idx} className="cor-turn">
                  <span className="cor-mark is-r" aria-hidden="true">R.</span>
                  <div className="cor-r-body">
                    <p className="cor-r-text" dangerouslySetInnerHTML={{ __html: renderRich(m.content) }} />
                  </div>
                </div>
              )
            })}
            {loading ? (
              <div className="cor-turn">
                <span className="cor-mark is-r" aria-hidden="true">R.</span>
                <div className="cor-r-body cor-waiting">
                  <span className="cor-breathe" aria-label="回信撰写中" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {error || conversationError ? <p className="cor-error" role="alert">{error || conversationError}</p> : null}
      {notice ? <p className="cor-error" role="status">{notice}</p> : null}

      {image ? (
        <div className="cor-attach">
          <figure className="cor-figure cor-figure-pending">
            <figcaption lang="fr">Figure à joindre · 待发送</figcaption>
            <img src={image.preview} alt="待发送的图片" />
          </figure>
          <button type="button" className="cor-attach-remove" onClick={() => setImage(null)} disabled={busy} aria-label="移除图片">×</button>
        </div>
      ) : null}

      <form
        className="cor-composer"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <button
          type="button"
          className="cor-joindre"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          lang="fr"
        >
          <span className="cor-joindre-long">Joindre une figure</span>
          <span className="cor-joindre-short">Figure</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />
        <textarea
          ref={inputRef}
          className="cor-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder={typeof window !== 'undefined' && window.innerWidth < 640 ? 'Poser une question…' : 'Poser une question… · 中法双语均可'}
          rows={1}
          disabled={busy}
          aria-label="向 AI 助手提问"
        />
        <button type="submit" className="cor-envoyer" disabled={busy || (!input.trim() && !image)} lang="fr">
          Envoyer
        </button>
      </form>
      <p className="cor-foot">由 Gemini 驱动 · 仅供学习参考,请自行核对。</p>
    </main>
  )
}
