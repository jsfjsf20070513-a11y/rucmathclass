// Cloudflare Worker — 班级后端代理 for rucmathclass.com.
//
// 两个无状态端点,持有的 API key 都是 Wrangler secret,浏览器永远拿不到:
//   POST /api/chat   → Gemini(GEMINI_API_KEY)双语数学/法语答疑,返回 { text }。
//   GET  /api/speak  → Gemini TTS(同一把 GEMINI_API_KEY)按需法语朗读;Gemini 返回
//                      16-bit PCM,Worker 包 WAV 头后返回 audio/wav。免费层、不绑卡。
//                      用 Cloudflare 边缘缓存(caches.default),每个词一辈子只生成一次。
//
// 设计取向与主站一致:静态 SPA + 极薄无状态代理;不引入数据库、不存对话。
// 部署见 ../README.md。

import { handleChat } from './chat.js'
import { corsHeaders, json } from './http.js'

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

async function handleSpeak(request, env, ctx, url, origin) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, origin)
  if (!env.GEMINI_API_KEY) return json({ error: 'Server not configured' }, 500, origin)

  const text = `${url.searchParams.get('text') || ''}`.trim().slice(0, TTS_MAX_CHARS)
  if (!text) return json({ error: 'No text' }, 400, origin)

  const voice = env.TTS_VOICE || TTS_VOICE
  const model = env.TTS_MODEL || TTS_MODEL

  // 边缘缓存:key 含 voice/model,换声音/模型自动失效。
  const cache = caches.default
  const cacheKey = new Request(`https://rucmathclass.com/api/speak?v=${voice}&m=${model}&text=${encodeURIComponent(text)}`, { method: 'GET' })
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const reqBody = JSON.stringify({
    contents: [{ parts: [{ text: `Lis en français, clairement et lentement : ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  })

  // Gemini TTS preview 偶发空返回(finishReason OTHER),重试一次让它稳。
  let inline = null
  let lastDetail = ''
  for (let attempt = 0; attempt < 2 && !inline; attempt += 1) {
    let upstream
    try {
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': env.GEMINI_API_KEY },
          body: reqBody,
        },
      )
    } catch {
      return json({ error: 'Upstream unreachable' }, 502, origin)
    }
    if (!upstream.ok) {
      try {
        lastDetail = (await upstream.text()).slice(0, 400)
      } catch {
        // ignore
      }
      // 4xx(配额/参数)重试也没用,直接返回
      if (upstream.status >= 400 && upstream.status < 500) {
        return json({ error: 'TTS error', status: upstream.status, detail: lastDetail }, 502, origin)
      }
      continue
    }
    const data = await upstream.json()
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || []
    inline = parts.map((p) => p && p.inlineData).filter(Boolean)[0] || null
    if (!inline) lastDetail = JSON.stringify(data).slice(0, 300)
  }
  if (!inline || !inline.data) {
    return json({ error: 'No audio', detail: lastDetail }, 502, origin)
  }
  const rateMatch = /rate=(\d+)/.exec(inline.mimeType || '')
  const rate = rateMatch ? Number(rateMatch[1]) : 24000
  const wav = wavFromPcm(base64ToBytes(inline.data), rate, 1, 16)

  const resp = new Response(wav, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...corsHeaders(origin),
    },
  })
  ctx.waitUntil(cache.put(cacheKey, resp.clone()))
  return resp
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || ''
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    // 简单限流:每 IP 每分钟若干次,防刷爆 Gemini/ElevenLabs 配额。绑定缺失时跳过。
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'anon'
      try {
        const { success } = await env.RATE_LIMITER.limit({ key: ip })
        if (!success) return json({ error: 'Trop de requêtes — réessaie dans un instant.' }, 429, origin)
      } catch {
        // limiter is best-effort; never block on its failure
      }
    }
    const url = new URL(request.url)
    if (url.pathname.endsWith('/api/speak')) return handleSpeak(request, env, ctx, url, origin)
    return handleChat(request, env, origin)
  },
}
