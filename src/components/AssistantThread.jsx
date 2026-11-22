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
  const { messages, ready, busy, loading, partial, error: conversationError, notice } =
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
    // Safari 可以在键盘升起后继续平移可见视口，resize 和 scroll 会分别到达。
    const fitViewport = () => {
      if (viewport.scale !== 1) return
      page.style.setProperty('--cor-visible-height', `${viewport.height}px`)
      page.style.setProperty('--cor-visible-top', `${viewport.offsetTop}px`)
      page.toggleAttribute('data-visual-viewport',
        viewport.offsetTop > 0 || viewport.height < document.documentElement.clientHeight)
    }
    fitViewport()
    viewport.addEventListener('resize', fitViewport)
    viewport.addEventListener('scroll', fitViewport)
    return () => {
      viewport.removeEventListener('resize', fitViewport)
      viewport.removeEventListener('scroll', fitViewport)
      page.style.removeProperty('--cor-visible-height')
      page.style.removeProperty('--cor-visible-top')
      page.removeAttribute('data-visual-viewport')
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
  const followReply = useRef(true)
  const firstQuestion = useRef(null)
  const focused = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; imageGeneration.current += 1 }
  }, [])
  useEffect(() => {
    if (sendingHere.current && followReply.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    } else if (rise && !focused.current && firstQuestion.current && ready) {
      return focusOnPaper(firstQuestion.current, { preventScroll: true })
    }
  }, [messages, partial, loading, ready, rise])

  const send = async (text) => {
    if (busy || (!text.trim() && !image)) return
    sendingHere.current = true
    followReply.current = true
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
        <div className="cor-thread" ref={scrollRef} onScroll={({ currentTarget: el }) => {
          followReply.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
        }}>
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
            {partial && <article className="cor-turn cor-reply-pending" data-streaming-reply="" aria-label="助手回复">{partial}</article>}
            {loading && !partial ? <div className="cor-waiting" role="status" aria-label="正在回复">…</div> : null}
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
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M4.2 6.1c5.8-.5 11.9-.4 17.6.2.4 4.6.5 9.3.1 13.9-5.9.4-11.8.5-17.7-.1-.5-4.7-.4-9.4 0-14z" />
            <path d="M5.5 18.6l5.2-6.1 3.6 4 2.6-2.7 3.8 4.6" />
            <path d="M17.3 9.4c.1.9-.6 1.6-1.4 1.6-.8.1-1.5-.6-1.5-1.4 0-.9.6-1.5 1.4-1.6.8 0 1.5.6 1.5 1.4z" />
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
          rows={1}
          disabled={busy}
          aria-label="向 AI 助手提问"
        />
        <button type="submit" className="cor-envoyer" aria-label="发送" disabled={busy || (!input.trim() && !image)}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M3.6 12.1c6.3-2.6 12.6-5.4 18.8-7.9-1.6 6.1-3.5 12.2-5.3 18.2-1.9-2.2-3.7-4.4-5.5-6.7-2.7-1.2-5.4-2.4-8-3.6z" />
            <path d="M22.3 4.3c-3.6 3.9-7.1 7.7-10.7 11.4" />
            <path d="M11.7 15.8l-.5 5.1 2.6-2.6" />
          </svg>
        </button>
      </form>
    </div>
  )
}
