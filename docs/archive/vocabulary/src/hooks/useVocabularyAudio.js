import { useCallback, useEffect, useRef } from 'react'

export function useVocabularyAudio() {
  const audioRef = useRef(null)
  const pendingSpeech = useRef(null)
  const cancelSpeech = useCallback(() => {
    pendingSpeech.current?.()
    pendingSpeech.current = null
    try { window.speechSynthesis?.cancel() } catch { /* 朗读不可用不影响练习。 */ }
  }, [])
  useEffect(() => () => {
    cancelSpeech()
    audioRef.current?.close().catch(() => {})
    audioRef.current = null
  }, [cancelSpeech])
  // ── audio: WebAudio verdict cue + speechSynthesis for the listen format ──
  const tone = useCallback((ok) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ac = audioRef.current || (audioRef.current = new Ctx())
      if (ac.state === 'suspended') ac.resume().catch(() => {})
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

  const speak = useCallback((text) => {
    cancelSpeech()
    try {
      const synth = window.speechSynthesis
      if (!synth || !text) return
      let done = false
      let timer
      const clear = () => {
        done = true
        clearTimeout(timer)
        synth.removeEventListener('voiceschanged', speakWith)
      }
      // Speak with a FRENCH voice. getVoices() is often empty on first call until
      // the engine loads — wait once for `voiceschanged`, with a timed safety. The
      // `done` flag guarantees exactly one utterance (never English + French double).
      const speakWith = () => {
        if (done) return
        clear()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'fr-FR'
        u.rate = 0.9
        const fr = (synth.getVoices() || []).find((v) => /fr/i.test(v.lang))
        if (fr) u.voice = fr
        synth.speak(u)
      }
      pendingSpeech.current = clear
      if ((synth.getVoices() || []).length) {
        speakWith()
      } else {
        synth.addEventListener('voiceschanged', speakWith, { once: true })
        timer = setTimeout(speakWith, 300)
      }
    } catch {
      // speech is optional
    }
  }, [cancelSpeech])

  return { tone, speak, cancelSpeech }
}
