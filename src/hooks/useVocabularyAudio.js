import { useCallback, useRef } from 'react'

// Browser speech is the current voice source; Worker TTS remains opt-in.
const SPEAK_ENDPOINT = 'https://rucmathclass.com/api/speak'
const USE_WORKER_VOICE = false

export function useVocabularyAudio() {
  const audioRef = useRef(null)
  const voiceRef = useRef(null)
  // ── audio: WebAudio verdict cue + speechSynthesis for the listen format ──
  const tone = useCallback((ok) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ac = audioRef.current || (audioRef.current = new Ctx())
      if (ac.state === 'suspended') ac.resume()
      const t = ac.currentTime
      const notes = ok ? [587.33, 880] : [392, 261.63]
      notes.forEach((f, k) => {
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        osc.type = 'sine'
        osc.frequency.value = f
        const st = t + k * 0.1
        gain.gain.setValueAtTime(0.0001, st)
        gain.gain.exponentialRampToValueAtTime(0.09, st + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.22)
        osc.connect(gain)
        gain.connect(ac.destination)
        osc.start(st)
        osc.stop(st + 0.24)
      })
    } catch {
      // audio is a nicety; never let it break the study flow
    }
  }, [])

  const browserTTS = useCallback((text) => {
    try {
      const synth = window.speechSynthesis
      if (!synth || !text) return
      synth.cancel()
      let done = false
      // Speak with a FRENCH voice. getVoices() is often empty on first call until
      // the engine loads — wait once for `voiceschanged`, with a timed safety. The
      // `done` flag guarantees exactly one utterance (never English + French double).
      const speakWith = () => {
        if (done) return
        done = true
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'fr-FR'
        u.rate = 0.9
        const fr = (synth.getVoices() || []).find((v) => /fr/i.test(v.lang))
        if (fr) u.voice = fr
        synth.speak(u)
      }
      if ((synth.getVoices() || []).length) {
        speakWith()
      } else {
        synth.addEventListener('voiceschanged', speakWith, { once: true })
        setTimeout(speakWith, 300)
      }
    } catch {
      // speech is optional
    }
  }, [])

  // Prefer the real voice via the Worker; fall back to browser TTS if the audio
  // can't load. `fallbackOnce` guards so the fallback fires AT MOST ONCE — both
  // `onerror` and the play() rejection used to fire it, causing a double voice.
  const speak = useCallback((text) => {
    if (!text) return
    try { window.speechSynthesis && window.speechSynthesis.cancel() } catch { /* ignore */ }
    // 暂走浏览器法语 TTS(见 USE_WORKER_VOICE 注释)。
    if (!USE_WORKER_VOICE) {
      browserTTS(text)
      return
    }
    let usedFallback = false
    const fallbackOnce = () => {
      if (usedFallback) return
      usedFallback = true
      browserTTS(text)
    }
    try {
      const a = voiceRef.current || (voiceRef.current = new Audio())
      a.onerror = fallbackOnce
      a.src = `${SPEAK_ENDPOINT}?text=${encodeURIComponent(text.slice(0, 160))}`
      const p = a.play()
      if (p && typeof p.catch === 'function') p.catch(fallbackOnce)
    } catch {
      fallbackOnce()
    }
  }, [browserTTS])

  return { tone, speak }
}
