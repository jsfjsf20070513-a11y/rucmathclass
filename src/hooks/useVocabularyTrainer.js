import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { EXERCISE_TYPES } from '../lib/exerciseGenerator'
import { createVocabularyTrainer } from '../lib/vocabularyTrainer'
import { readSessionSnapshot, writeSessionSnapshot, clearSessionSnapshot } from '../lib/vocabularySession'
import * as repository from '../lib/vocabularyBackend'
import { useVocabularyAudio } from './useVocabularyAudio'

const snapshots = { read: readSessionSnapshot, write: writeSessionSnapshot, clear: clearSessionSnapshot }

// Browser adapter: account lifetime, keyboard, focus and audio only.
export function useVocabularyTrainer(userId) {
  const trainer = useMemo(() => createVocabularyTrainer({ userId, repository, snapshots }), [userId])
  const state = useSyncExternalStore(trainer.subscribe, trainer.getSnapshot)
  const { status, phase, current, i, lastCorrect, match } = state
  const { choose, submitSpelling, next, commencer, studyNext } = trainer
  const inputRef = useRef(null)
  const { tone, speak } = useVocabularyAudio()

  useEffect(() => {
    trainer.initialize()
    return trainer.dispose
  }, [trainer])

  useEffect(() => {
    return () => { try { window.speechSynthesis?.cancel() } catch { /* optional audio */ } }
  }, [trainer, i, status])

  useEffect(() => {
    if (status === 'ready' && phase === 'feedback') tone(lastCorrect)
  }, [status, phase, current, lastCorrect, tone])

  useEffect(() => {
    if (status !== 'ready' || phase !== 'answer') return
    if (current?.exercise.type === EXERCISE_TYPES.listen) speak(current.exercise.audioText)
    if (current?.exercise.type === EXERCISE_TYPES.spelling) inputRef.current?.focus()
  }, [status, phase, current, speak])

  useEffect(() => {
    if (!match.wrong.length) return undefined
    const timer = window.setTimeout(() => trainer.clearMatchError(match.wrong), 380)
    return () => window.clearTimeout(timer)
  }, [trainer, match.wrong])

  // keyboard: 1–4 pick options, Enter submits/advances
  useEffect(() => {
    if (status !== 'ready') return undefined
    const onKey = (event) => {
      const tagName = event.target?.tagName
      const inField = tagName === 'INPUT' || tagName === 'TEXTAREA'
      if (phase === 'feedback') {
        if (event.key === 'Enter' || event.code === 'Space') {
          if (inField && event.key !== 'Enter') return
          event.preventDefault()
          next()
        }
        return
      }
      const ex = current?.exercise
      if (!ex) return
      if ((ex.type === EXERCISE_TYPES.recognition || ex.type === EXERCISE_TYPES.cloze || ex.type === EXERCISE_TYPES.listen) && !inField) {
        const n = Number(event.key)
        if (n >= 1 && n <= ex.options.length) {
          event.preventDefault()
          choose(ex.options[n - 1])
        }
      } else if (ex.type === EXERCISE_TYPES.spelling && event.key === 'Enter') {
        event.preventDefault()
        submitSpelling()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, phase, current, choose, submitSpelling, next])

  // study preview: Enter / Space advances; idle: Enter begins
  useEffect(() => {
    if (status !== 'study' && status !== 'idle') return undefined
    const onKey = (event) => {
      if (event.key === 'Enter' || event.code === 'Space') {
        if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA' || event.target?.tagName === 'BUTTON') return
        event.preventDefault()
        if (status === 'idle') commencer()
        else studyNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, studyNext, commencer])

  return { ...state, ...trainer, inputRef, speak }
}
