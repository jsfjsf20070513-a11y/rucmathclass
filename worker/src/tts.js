import { corsHeaders, json } from './http.js'
import { createRequestScope } from './requestScope.js'

// Gemini 原生 TTS:多语种预置声音(支持法语)。换声音改 env.TTS_VOICE。
const TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const TTS_VOICE = 'Kore'
const TTS_MAX_CHARS = 160

// base64 → Uint8Array(Worker 有全局 atob)。
function base64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

// 给裸 PCM 加 44 字节 WAV 头,使 <audio> 能直接播。
function wavFromPcm(pcm, sampleRate, channels, bits) {
  const blockAlign = channels * (bits / 8)
  const byteRate = sampleRate * blockAlign
  const dataLen = pcm.length
  const buf = new Uint8Array(44 + dataLen)
  const dv = new DataView(buf.buffer)
  const wr = (off, s) => { for (let i = 0; i < s.length; i += 1) dv.setUint8(off + i, s.charCodeAt(i)) }
  wr(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); wr(8, 'WAVE')
  wr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true)
  dv.setUint16(22, channels, true); dv.setUint32(24, sampleRate, true)
  dv.setUint32(28, byteRate, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, bits, true)
  wr(36, 'data'); dv.setUint32(40, dataLen, true)
  buf.set(pcm, 44)
  return buf
}

function audioFromResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts
  const inline = Array.isArray(parts) && parts.find((part) => part?.inlineData)?.inlineData
  if (!inline) return null
  const mime = inline.mimeType || ''
  const rateMatch = /(?:^|;)\s*rate=(\d+)(?:;|$)/i.exec(mime)
  const rate = rateMatch ? Number(rateMatch[1]) : 24000
  if (!/^audio\/L16(?:;|$)/i.test(mime) || /channels=(?!1(?:;|$))/.test(mime)
    || /rate=/i.test(mime) && !rateMatch || rate < 8000 || rate > 96000
    || typeof inline.data !== 'string' || !inline.data.length || inline.data.length > 8000000) {
    throw new Error('Invalid audio')
  }
  const pcm = base64ToBytes(inline.data)
  if (!pcm.length || pcm.length % 2) throw new Error('Invalid PCM')
  return wavFromPcm(pcm, rate, 1, 16)
}

function withCors(response, origin) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value)
  return new Response(response.body, { status: response.status, headers })
}

export async function handleSpeak(request, env, ctx, url, origin) {
  if (!env.GEMINI_API_KEY) return json({ error: 'Server not configured' }, 500, origin)
  const text = (url.searchParams.get('text') || '').trim().slice(0, TTS_MAX_CHARS)
  if (!text) return json({ error: 'No text' }, 400, origin)
  const voice = env.TTS_VOICE || TTS_VOICE
  const model = env.TTS_MODEL || TTS_MODEL
  const cacheUrl = new URL('https://rucmathclass.com/api/speak')
  cacheUrl.search = new URLSearchParams({ format: 'wav-v2', v: voice, m: model, text }).toString()
  const cacheKey = new Request(cacheUrl)
  const cache = globalThis.caches?.default
  const scope = createRequestScope(request.signal, 20000)
  try {
    // Cache only the audio. CORS always belongs to the current caller.
    try {
      const hit = cache && await scope.run(() => cache.match(cacheKey))
      if (hit) return withCors(hit, origin)
    } catch { /* Cache failure must not prevent generation. */ }
    const body = JSON.stringify({
      contents: [{ parts: [{ text: `Lis en français, clairement et lentement : ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const upstream = await scope.run(() => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': env.GEMINI_API_KEY }, body, signal: scope.signal },
      ))
      if (!upstream.ok) {
        upstream.body?.cancel().catch(() => {})
        if (upstream.status < 500) return json({ error: 'TTS error', status: upstream.status }, 502, origin)
        continue
      }
      const wav = audioFromResponse(await scope.run(() => upstream.json()))
      if (!wav) continue
      const response = new Response(wav, { headers: {
        'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=31536000, immutable',
      } })
      if (cache) {
        const cached = response.clone()
        ctx.waitUntil(Promise.resolve().then(() => cache.put(cacheKey, cached)).catch(() => {}))
      }
      return withCors(response, origin)
    }
    return json({ error: 'No audio' }, 502, origin)
  } catch {
    if (request.signal.aborted) return json({ error: 'Request cancelled' }, 499, origin)
    return json({ error: scope.signal.aborted ? 'TTS timed out' : 'TTS unavailable' }, scope.signal.aborted ? 504 : 502, origin)
  } finally { scope.close() }
}
