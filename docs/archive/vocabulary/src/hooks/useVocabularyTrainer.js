import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { EXERCISE_TYPES } from '../lib/exerciseGenerator'
import { createVocabularyTrainer } from '../lib/vocabularyTrainer'
import { readSessionSnapshot, writeSessionSnapshot, clearSessionSnapshot } from '../lib/vocabularySession'
import * as repository from '../lib/vocabularyBackend'
import { useVocabularyAudio } from './useVocabularyAudio'

const snapshots = { read: readSessionSnapshot, write: writeSessionSnapshot, clear: clearSessionSnapshot }
const ownsKeyboard = (event) => Boolean(event.target?.closest?.('button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"])'))
const skipShortcut = (event) => event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey

// Browser adapter: account lifetime, keyboard, focus and audio only.
export function useVocabularyTrainer(userId) {
  const trainer = useMemo(() => createVocabularyTrainer({ userId, repository, snapshots }), [userId])
  const state = useSyncExternalStore(trainer.subscribe, trainer.getSnapshot)
  const { status, phase, current, i, studyIdx, lastCorrect, match } = state
  const { choose, submitSpelling, next, commencer, studyNext } = trainer
  const inputRef = useRef(null)
  const { tone, speak, cancelSpeech } = useVocabularyAudio()

  useEffect(() => {
    trainer.initialize()
    return trainer.dispose
  }, [trainer])

  useEffect(() => {
    return cancelSpeech
  }, [trainer, i, studyIdx, status, phase, cancelSpeech])

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
      if (skipShortcut(event)) return
      const ex = current?.exercise
      const spellingSubmit = phase === 'answer' && ex?.type === EXERCISE_TYPES.spelling && event.target === inputRef.current && event.key === 'Enter'
      if (ownsKeyboard(event) && !spellingSubmit) return
      if (phase === 'feedback') {
        if (event.key === 'Enter' || event.code === 'Space') {
          event.preventDefault()
          next()
        }
        return
      }
      if (!ex) return
      if (ex.type === EXERCISE_TYPES.recognition || ex.type === EXERCISE_TYPES.cloze || ex.type === EXERCISE_TYPES.listen) {
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
      if (skipShortcut(event) || ownsKeyboard(event)) return
      if (event.key === 'Enter' || event.code === 'Space') {
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
