import { focusOnPaper } from '../lib/paperFonts'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { loadAssistantReply } from '../routes/pageLoaders'

const AssistantReply = lazy(loadAssistantReply)

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

export default function AssistantThread({ conversation, onStart, rise }) {
  const [input, setInput] = useState('')
  const { messages, ready, busy, loading, error: conversationError, notice } =
    useSyncExternalStore(conversation.subscribe, conversation.getSnapshot)
  useEffect(() => { conversation.initialize() }, [conversation])
  const [error, setError] = useState('')
  const [image, setImage] = useState(null) // { mimeType, data, preview }
  const pageRef = useRef(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const imageGeneration = useRef(0)

  useLayoutEffect(() => {
    const page = pageRef.current?.closest('main')
    const viewport = window.visualViewport
    if (!page || !viewport) return
    // 有些手机只在软键盘弹出时缩小可见视口，布局视口仍是整屏高度。
    const fitViewport = () => {
      if (viewport.scale === 1) page.style.setProperty('--cor-visible-height', `${viewport.height}px`)
    }
    fitViewport()
    viewport.addEventListener('resize', fitViewport)
    return () => {
      viewport.removeEventListener('resize', fitViewport)
      page.style.removeProperty('--cor-visible-height')
    }
  }, [])

  useLayoutEffect(() => {
    const field = inputRef.current
    if (!field) return
    const fitText = () => {
      field.style.height = 'auto'
      field.style.height = `${field.scrollHeight}px`
    }
    fitText()
    window.addEventListener('resize', fitText)
    return () => window.removeEventListener('resize', fitText)
  }, [input])

  const sendingHere = useRef(false)
  const firstQuestion = useRef(null)
  const focused = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; imageGeneration.current += 1 }
  }, [])
  useEffect(() => {
    if (sendingHere.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    } else if (rise && !focused.current && firstQuestion.current && ready) {
      return focusOnPaper(firstQuestion.current, { preventScroll: true })
    }
  }, [messages, loading, ready, rise])

  const send = async (text) => {
    if (busy || (!text.trim() && !image)) return
    sendingHere.current = true
    imageGeneration.current += 1
    setError('')
    const sent = conversation.send(text, image)
    onStart?.()
    if (await sent && mounted.current) {
      setInput('')
      setImage(null)
      focusOnPaper(inputRef.current)
    }
  }

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
      setError('图片过大。请选择不超过 12 MB 的图片。')
      return
    }
    try {
      setError('')
      const compressed = await compressImage(file)
      if (generation === imageGeneration.current) setImage(compressed)
    } catch {
      if (generation === imageGeneration.current) setError('图片处理失败，换一张试试。')
    }
  }, [])

  let figureCounter = 0
  return (
    <div ref={pageRef} className="cor-body" aria-busy={!ready}>
      {messages.length === 0 && !busy ? (
        <div className="cor-cover">
          <h1 className="cor-masthead" lang="fr">De quoi veux-tu parler&#8239;?</h1>
        </div>
      ) : (
        <div className="cor-thread" ref={scrollRef}>
          <div className="cor-thread-inner">
            {messages.map((m, idx) => {
              if (m.role === 'user') {
                const fig = m.image ? ++figureCounter : 0
                return (
                  <article key={idx} ref={idx === 0 ? firstQuestion : undefined} onFocus={() => { focused.current = true }} tabIndex={-1} aria-label="你的提问" className="cor-turn cor-question">
                    {m.image ? (
                      <figure className="cor-figure">
                        <figcaption>{`图片 ${fig} · 刷新后需重新上传`}</figcaption>
                        <img src={m.image} alt={`随问题发送的图片 ${fig}`} />
                      </figure>
                    ) : null}
                    <p>{m.content}</p>
                  </article>
                )
              }
              return (
                <article key={idx} className="cor-turn" aria-label="助手回复">
                  <Suspense fallback={<div className="cor-reply-pending">{m.content}</div>}>
                    <AssistantReply text={m.content} />
                  </Suspense>
                </article>
              )
            })}
            {loading ? <div className="cor-waiting" role="status" aria-label="正在回复">…</div> : null}
          </div>
        </div>
      )}

      {error || conversationError ? <p className="cor-error" role="alert">{error || conversationError}</p> : null}
      {notice ? <p className="cor-error" role="status">{notice}</p> : null}

      {image ? (
        <div className="cor-attach">
          <figure className="cor-figure cor-figure-pending">
            <figcaption>待发送</figcaption>
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
          aria-label="添加图片"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m3.5 17 5-5 3.5 3.5 4.5-6 4.5 5.5" />
          </svg>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} hidden />
        <textarea
          ref={inputRef}
          className="cor-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="写消息…"
          rows={1}
          disabled={busy}
          aria-label="向 AI 助手提问"
        />
        <button type="submit" className="cor-envoyer" disabled={busy || (!input.trim() && !image)}>
          发送
        </button>
      </form>
    </div>
  )
}
